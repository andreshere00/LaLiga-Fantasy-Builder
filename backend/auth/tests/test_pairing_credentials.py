# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import time
from dataclasses import replace
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fantasy_auth.adapters.jwks import StaticJwksValidator
from fantasy_auth.adapters.memory import (
    FixedClock,
    MemoryConnectionRepo,
    MemoryPairingStore,
)
from fantasy_auth.adapters.vault_aesgcm import AesGcmTokenVault
from fantasy_auth.application.credentials import CredentialProvider
from fantasy_auth.application.pairing import PairingService
from fantasy_auth.domain.errors import (
    NeedsReauth,
    OwnershipError,
    PairingError,
    ValidationError,
)
from fantasy_auth.domain.tokens import TokenBundle
from fantasy_auth.ports.repos import ConnectionRecord

ISSUER = "https://login.laliga.es/335316eb-f606-4361-bb86-35a7edcdcec1/v2.0/"
CLIENT_ID = "af88bcff-1157-40a0-b579-030728aacf0b"
POLICY = "B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN"
SCOPE = "openid offline_access"
# Domain/clock time used by FixedClock (independent of JWT wall-clock exp).
NOW = 1_700_000_000


@pytest.fixture
def rsa_keys() -> tuple[bytes, bytes]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return private_pem, public_pem


def mint_token(
    private_pem: bytes,
    *,
    audience: str = CLIENT_ID,
    issuer: str = ISSUER,
    nonce: str | None = "nonce-1",
    exp: int | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    # PyJWT validates exp against wall clock, not FixedClock.
    wall_exp = exp if exp is not None else int(time.time()) + 3600
    payload: dict[str, Any] = {
        "sub": "b2c-sub",
        "oid": "b2c-oid",
        "email": "manager@example.com",
        "name": "Manager",
        "iss": issuer,
        "aud": audience,
        "exp": wall_exp,
        "iat": int(time.time()),
    }
    if nonce is not None:
        payload["nonce"] = nonce
    if extra:
        payload.update(extra)
    return jwt.encode(payload, private_pem, algorithm="RS256")


class FakeFantasy:
    def __init__(self, profile: dict[str, Any] | None = None) -> None:
        self.profile = profile or {
            "id": "mgr-1",
            "managerName": "El Manager",
            "email": "manager@example.com",
        }
        self.calls: list[str] = []

    async def get_current_user(self, bearer_token: str) -> dict[str, Any]:
        self.calls.append(bearer_token)
        return self.profile


class FakeB2C:
    def __init__(self) -> None:
        self.refresh_result: dict[str, Any] | None = {
            "id_token": "refreshed-id",
            "access_token": "refreshed-access",
            "refresh_token": "rotated-refresh",
            "expires_in": 3600,
        }
        self.refresh_error: Exception | None = None
        self.calls = 0

    async def refresh(self, **kwargs: Any) -> dict[str, Any]:
        self.calls += 1
        if self.refresh_error:
            raise self.refresh_error
        assert self.refresh_result is not None
        return self.refresh_result

    def build_authorize_url(self, **kwargs: Any) -> str:
        return "https://example.test/authorize"

    async def exchange_code(self, **kwargs: Any) -> TokenBundle:
        raise NotImplementedError


def build_pairing_service(
    *,
    private_pem: bytes,
    public_pem: bytes,
    clock: FixedClock | None = None,
) -> tuple[PairingService, MemoryPairingStore, MemoryConnectionRepo, AesGcmTokenVault]:
    clock = clock or FixedClock(NOW)
    pairings = MemoryPairingStore()
    connections = MemoryConnectionRepo()
    vault = AesGcmTokenVault(b"k" * 32)
    jwks = StaticJwksValidator(public_key_pem=public_pem, issuer=ISSUER)
    fantasy = FakeFantasy()
    service = PairingService(
        pairings=pairings,
        connections=connections,
        vault=vault,
        jwks=jwks,
        fantasy=fantasy,
        clock=clock,
        client_id=CLIENT_ID,
        policy=POLICY,
        scope=SCOPE,
        pairing_ttl_seconds=600,
        b2c=FakeB2C(),
    )
    return service, pairings, connections, vault


# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_complete_pairing_seals_tokens_and_returns_profile(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    service, _pairings, connections, vault = build_pairing_service(
        private_pem=private_pem,
        public_pem=public_pem,
    )
    created = await service.create_pairing("app-user-1")
    id_token = mint_token(private_pem, nonce=created.nonce)

    # Act
    result = await service.complete_pairing(
        pairing_id=created.pairing_id,
        secret=created.secret,
        token_response={
            "access_token": "access-1",
            "id_token": id_token,
            "refresh_token": "refresh-1",
            "expires_in": 3600,
        },
    )

    # Assert
    assert result.user_id == "app-user-1"
    assert result.profile.user_id == "mgr-1"
    assert result.profile.manager_name == "El Manager"
    stored = await connections.get("app-user-1")
    assert stored is not None
    opened = vault.open(stored.sealed_blob)
    assert opened.access_token == "access-1"
    assert opened.refresh_token == "refresh-1"


@pytest.mark.asyncio
async def test_credential_provider_returns_bearer_without_refresh_when_valid(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    service, _p, connections, vault = build_pairing_service(
        private_pem=private_pem,
        public_pem=public_pem,
    )
    created = await service.create_pairing("u1")
    id_token = mint_token(private_pem, nonce=created.nonce)
    await service.complete_pairing(
        pairing_id=created.pairing_id,
        secret=created.secret,
        token_response={
            "access_token": "still-valid",
            "id_token": id_token,
            "refresh_token": "r",
            "expires_in": 3600,
        },
    )
    b2c = FakeB2C()
    provider = CredentialProvider(
        connections=connections,
        vault=vault,
        b2c=b2c,
        clock=FixedClock(NOW),
        refresh_skew_seconds=60,
    )

    # Act
    bearer = await provider.get_valid_bearer_token("u1")

    # Assert
    assert bearer == "still-valid"
    assert b2c.calls == 0


@pytest.mark.asyncio
async def test_credential_provider_refreshes_inside_skew_and_rotates(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    clock = FixedClock(NOW)
    service, _p, connections, vault = build_pairing_service(
        private_pem=private_pem,
        public_pem=public_pem,
        clock=clock,
    )
    created = await service.create_pairing("u1")
    id_token = mint_token(private_pem, nonce=created.nonce)
    await service.complete_pairing(
        pairing_id=created.pairing_id,
        secret=created.secret,
        token_response={
            "access_token": "old",
            "id_token": id_token,
            "refresh_token": "old-r",
            "expires_in": 30,
        },
    )
    b2c = FakeB2C()
    provider = CredentialProvider(
        connections=connections,
        vault=vault,
        b2c=b2c,
        clock=clock,
        refresh_skew_seconds=60,
    )

    # Act
    bearer = await provider.get_valid_bearer_token("u1")

    # Assert
    assert bearer == "refreshed-id"
    assert b2c.calls == 1
    stored = await connections.get("u1")
    assert stored is not None
    opened = vault.open(stored.sealed_blob)
    assert opened.refresh_token == "rotated-refresh"


# ---- Error paths ---- #


@pytest.mark.asyncio
async def test_complete_pairing_rejects_bad_secret(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    service, *_ = build_pairing_service(private_pem=private_pem, public_pem=public_pem)
    created = await service.create_pairing("u1")
    id_token = mint_token(private_pem, nonce=created.nonce)

    # Act / Assert
    with pytest.raises(PairingError) as exc:
        await service.complete_pairing(
            pairing_id=created.pairing_id,
            secret="wrong-secret-value",
            token_response={
                "access_token": "a",
                "id_token": id_token,
                "expires_in": 100,
            },
        )
    assert exc.value.category == "pairing_secret"


@pytest.mark.asyncio
async def test_complete_pairing_rejects_replay(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    service, *_ = build_pairing_service(private_pem=private_pem, public_pem=public_pem)
    created = await service.create_pairing("u1")
    id_token = mint_token(private_pem, nonce=created.nonce)
    payload = {
        "access_token": "a",
        "id_token": id_token,
        "refresh_token": "r",
        "expires_in": 100,
    }
    await service.complete_pairing(
        pairing_id=created.pairing_id,
        secret=created.secret,
        token_response=payload,
    )

    # Act / Assert
    with pytest.raises(PairingError) as exc:
        await service.complete_pairing(
            pairing_id=created.pairing_id,
            secret=created.secret,
            token_response=payload,
        )
    assert exc.value.category == "pairing_replay"


@pytest.mark.asyncio
async def test_complete_pairing_rejects_expired(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    clock = FixedClock(NOW)
    service, *_ = build_pairing_service(
        private_pem=private_pem,
        public_pem=public_pem,
        clock=clock,
    )
    created = await service.create_pairing("u1")
    clock.advance(601)
    id_token = mint_token(private_pem, nonce=created.nonce)

    # Act / Assert
    with pytest.raises(PairingError) as exc:
        await service.complete_pairing(
            pairing_id=created.pairing_id,
            secret=created.secret,
            token_response={
                "access_token": "a",
                "id_token": id_token,
                "expires_in": 100,
            },
        )
    assert exc.value.category == "pairing_expired"


@pytest.mark.asyncio
async def test_jwks_rejects_bad_audience(rsa_keys: tuple[bytes, bytes]) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    validator = StaticJwksValidator(public_key_pem=public_pem, issuer=ISSUER)
    token = mint_token(private_pem, audience="wrong-aud")

    # Act / Assert
    with pytest.raises(ValidationError):
        await validator.validate(
            token,
            policy=POLICY,
            audience=CLIENT_ID,
            nonce="nonce-1",
        )


@pytest.mark.asyncio
async def test_jwks_rejects_nonce_mismatch(rsa_keys: tuple[bytes, bytes]) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    validator = StaticJwksValidator(public_key_pem=public_pem, issuer=ISSUER)
    token = mint_token(private_pem, nonce="expected")

    # Act / Assert
    with pytest.raises(ValidationError, match="nonce"):
        await validator.validate(
            token,
            policy=POLICY,
            audience=CLIENT_ID,
            nonce="other",
        )


@pytest.mark.asyncio
async def test_credential_provider_marks_needs_reauth_on_invalid_grant(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    from fantasy_auth.domain.errors import InvalidGrant

    private_pem, public_pem = rsa_keys
    clock = FixedClock(NOW)
    service, _p, connections, vault = build_pairing_service(
        private_pem=private_pem,
        public_pem=public_pem,
        clock=clock,
    )
    created = await service.create_pairing("u1")
    id_token = mint_token(private_pem, nonce=created.nonce)
    await service.complete_pairing(
        pairing_id=created.pairing_id,
        secret=created.secret,
        token_response={
            "access_token": "old",
            "id_token": id_token,
            "refresh_token": "r",
            "expires_in": 10,
        },
    )
    b2c = FakeB2C()
    b2c.refresh_error = InvalidGrant("expired")
    provider = CredentialProvider(
        connections=connections,
        vault=vault,
        b2c=b2c,
        clock=clock,
        refresh_skew_seconds=60,
    )

    # Act / Assert
    with pytest.raises(NeedsReauth):
        await provider.get_valid_bearer_token("u1")
    stored = await connections.get("u1")
    assert stored is not None
    assert stored.needs_reauth is True


@pytest.mark.asyncio
async def test_get_valid_bearer_needs_reauth_already_true_raises(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    service, _p, connections, vault = build_pairing_service(
        private_pem=private_pem,
        public_pem=public_pem,
    )
    created = await service.create_pairing("u1")
    id_token = mint_token(private_pem, nonce=created.nonce)
    await service.complete_pairing(
        pairing_id=created.pairing_id,
        secret=created.secret,
        token_response={
            "access_token": "a",
            "id_token": id_token,
            "refresh_token": "r",
            "expires_in": 3600,
        },
    )
    stored = await connections.get("u1")
    assert stored is not None
    await connections.save(replace(stored, needs_reauth=True))
    provider = CredentialProvider(
        connections=connections,
        vault=vault,
        b2c=FakeB2C(),
        clock=FixedClock(NOW),
        refresh_skew_seconds=60,
    )

    # Act / Assert
    with pytest.raises(NeedsReauth):
        await provider.get_valid_bearer_token("u1")


@pytest.mark.asyncio
async def test_retry_after_unauthorized_forces_refresh(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    service, _p, connections, vault = build_pairing_service(
        private_pem=private_pem,
        public_pem=public_pem,
    )
    created = await service.create_pairing("u1")
    id_token = mint_token(private_pem, nonce=created.nonce)
    await service.complete_pairing(
        pairing_id=created.pairing_id,
        secret=created.secret,
        token_response={
            "access_token": "still-valid",
            "id_token": id_token,
            "refresh_token": "r",
            "expires_in": 3600,
        },
    )
    b2c = FakeB2C()
    provider = CredentialProvider(
        connections=connections,
        vault=vault,
        b2c=b2c,
        clock=FixedClock(NOW),
        refresh_skew_seconds=60,
    )

    # Act
    bearer = await provider.retry_after_unauthorized("u1")

    # Assert
    assert bearer == "refreshed-id"
    assert b2c.calls == 1


@pytest.mark.asyncio
async def test_refresh_lock_not_acquired_raises_refresh_in_progress(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    clock = FixedClock(NOW)
    service, _p, connections, vault = build_pairing_service(
        private_pem=private_pem,
        public_pem=public_pem,
        clock=clock,
    )
    created = await service.create_pairing("u1")
    id_token = mint_token(private_pem, nonce=created.nonce)
    await service.complete_pairing(
        pairing_id=created.pairing_id,
        secret=created.secret,
        token_response={
            "access_token": "old",
            "id_token": id_token,
            "refresh_token": "r",
            "expires_in": 10,
        },
    )

    class HeldLock:
        async def acquire(self, user_id: str, *, ttl_seconds: int = 30) -> bool:
            del user_id, ttl_seconds
            return False

        async def release(self, user_id: str) -> None:
            del user_id

    b2c = FakeB2C()
    provider = CredentialProvider(
        connections=connections,
        vault=vault,
        b2c=b2c,
        clock=clock,
        refresh_skew_seconds=60,
        refresh_lock=HeldLock(),  # type: ignore[arg-type]
    )

    # Act / Assert
    with pytest.raises(NeedsReauth) as exc:
        await provider.get_valid_bearer_token("u1")
    assert "refresh_in_progress" in str(exc.value)
    assert b2c.calls == 0


@pytest.mark.asyncio
async def test_refresh_without_refresh_token_marks_needs_reauth(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    clock = FixedClock(NOW)
    service, _p, connections, vault = build_pairing_service(
        private_pem=private_pem,
        public_pem=public_pem,
        clock=clock,
    )
    created = await service.create_pairing("u1")
    id_token = mint_token(private_pem, nonce=created.nonce)
    await service.complete_pairing(
        pairing_id=created.pairing_id,
        secret=created.secret,
        token_response={
            "access_token": "old",
            "id_token": id_token,
            "refresh_token": "r",
            "expires_in": 10,
        },
    )
    stored = await connections.get("u1")
    assert stored is not None
    sealed = vault.seal(
        TokenBundle(
            access_token="old",
            id_token=id_token,
            refresh_token=None,
            expires_on=NOW + 10,
            expires_in=10,
            client_id=CLIENT_ID,
            policy=POLICY,
            scope=SCOPE,
        )
    )
    await connections.save(replace(stored, sealed_blob=sealed))
    b2c = FakeB2C()
    provider = CredentialProvider(
        connections=connections,
        vault=vault,
        b2c=b2c,
        clock=clock,
        refresh_skew_seconds=60,
    )

    # Act / Assert
    with pytest.raises(NeedsReauth):
        await provider.get_valid_bearer_token("u1")
    updated = await connections.get("u1")
    assert updated is not None
    assert updated.needs_reauth is True
    assert b2c.calls == 0


@pytest.mark.asyncio
async def test_get_valid_bearer_ownership_mismatch_raises(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_keys
    _service, _p, connections, vault = build_pairing_service(
        private_pem=_private_pem,
        public_pem=public_pem,
    )
    sealed = vault.seal(
        TokenBundle(
            access_token="a",
            expires_on=NOW + 3600,
            expires_in=3600,
            client_id=CLIENT_ID,
            policy=POLICY,
            scope=SCOPE,
            refresh_token="r",
        )
    )
    connections._connections["u1"] = ConnectionRecord(  # noqa: SLF001
        user_id="other-user",
        sealed_blob=sealed,
        policy=POLICY,
        client_id=CLIENT_ID,
        scope=SCOPE,
    )
    provider = CredentialProvider(
        connections=connections,
        vault=vault,
        b2c=FakeB2C(),
        clock=FixedClock(NOW),
        refresh_skew_seconds=60,
    )

    # Act / Assert
    with pytest.raises(OwnershipError):
        await provider.get_valid_bearer_token("u1")


# ---- Edge cases ---- #


@pytest.mark.asyncio
async def test_vault_roundtrip_preserves_bundle() -> None:
    # Arrange
    vault = AesGcmTokenVault(b"1" * 32)
    bundle = TokenBundle(
        access_token="a",
        id_token="i",
        refresh_token="r",
        expires_on=NOW + 100,
        expires_in=100,
        client_id=CLIENT_ID,
        policy=POLICY,
        scope=SCOPE,
    )

    # Act
    sealed = vault.seal(bundle)
    opened = vault.open(sealed)

    # Assert
    assert opened == bundle
    assert sealed[0] == 1


@pytest.mark.asyncio
async def test_unlink_removes_connection(rsa_keys: tuple[bytes, bytes]) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    service, _p, connections, _v = build_pairing_service(
        private_pem=private_pem,
        public_pem=public_pem,
    )
    created = await service.create_pairing("u1")
    id_token = mint_token(private_pem, nonce=created.nonce)
    await service.complete_pairing(
        pairing_id=created.pairing_id,
        secret=created.secret,
        token_response={
            "access_token": "a",
            "id_token": id_token,
            "refresh_token": "r",
            "expires_in": 100,
        },
    )

    # Act
    await service.unlink("u1")

    # Assert
    assert await connections.get("u1") is None


@pytest.mark.asyncio
async def test_jwks_rejects_expired_token(rsa_keys: tuple[bytes, bytes]) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    validator = StaticJwksValidator(public_key_pem=public_pem, issuer=ISSUER)
    token = mint_token(private_pem, exp=int(time.time()) - 10)

    # Act / Assert
    with pytest.raises(ValidationError):
        await validator.validate(token, policy=POLICY, audience=CLIENT_ID)
