# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from fantasy_auth.adapters.jwks import StaticAppOidcValidator
from fantasy_auth.adapters.memory import FixedClock, MemorySessionStore
from fantasy_auth.application.sessions import SessionService
from fantasy_auth.domain.errors import ValidationError
from fantasy_auth.domain.users import AppUser

ISSUER = "http://localhost:8080/realms/fantasy-builder"
CLIENT_ID = "laliga-fantasy-builder"
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


def mint_id_token(
    private_pem: bytes,
    *,
    audience: str = CLIENT_ID,
    issuer: str = ISSUER,
    nonce: str | None = "nonce-1",
    exp: int | None = None,
    sub: str = "app-user-1",
) -> str:
    wall_exp = exp if exp is not None else int(time.time()) + 3600
    payload: dict[str, Any] = {
        "sub": sub,
        "email": "user@example.com",
        "name": "User",
        "iss": issuer,
        "aud": audience,
        "exp": wall_exp,
        "iat": int(time.time()),
    }
    if nonce is not None:
        payload["nonce"] = nonce
    return jwt.encode(payload, private_pem, algorithm="RS256")


def build_session_service(
    *,
    public_pem: bytes,
    clock: FixedClock | None = None,
) -> tuple[SessionService, MemorySessionStore]:
    clock = clock or FixedClock(NOW)
    store = MemorySessionStore()
    validator = StaticAppOidcValidator(public_key_pem=public_pem, issuer=ISSUER)

    async def exchanger(code: str, _verifier: str) -> dict[str, Any]:
        return {"id_token": code, "access_token": "unused"}

    service = SessionService(
        sessions=store,
        clock=clock,
        session_ttl_seconds=3600,
        authorize_url="http://idp/auth",
        token_url="http://idp/token",
        client_id=CLIENT_ID,
        client_secret="",
        redirect_uri="http://localhost:8000/auth/callback",
        issuer=ISSUER,
        oidc_validator=validator,
        token_exchanger=exchanger,
    )
    return service, store


# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_complete_login_valid_id_token_binds_user(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    service, store = build_session_service(public_pem=public_pem)
    start = await service.start_login()
    session = await store.get(start.session_id)
    assert session is not None
    assert session.oidc_nonce is not None
    id_token = mint_id_token(private_pem, nonce=session.oidc_nonce)

    # Act
    view = await service.complete_login(
        session_id=start.session_id,
        code=id_token,
        state=session.oidc_state or "",
    )

    # Assert
    assert view.user == AppUser(
        user_id="app-user-1",
        email="user@example.com",
        name="User",
    )
    saved = await store.get(start.session_id)
    assert saved is not None
    assert saved.oidc_state is None
    assert saved.oidc_nonce is None


# ---- Error paths ---- #


@pytest.mark.asyncio
async def test_complete_login_rejects_bad_signature(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_pem = other.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    service, store = build_session_service(public_pem=public_pem)
    start = await service.start_login()
    session = await store.get(start.session_id)
    assert session is not None
    bad_token = mint_id_token(other_pem, nonce=session.oidc_nonce)

    # Act / Assert
    with pytest.raises(ValidationError):
        await service.complete_login(
            session_id=start.session_id,
            code=bad_token,
            state=session.oidc_state or "",
        )
    saved = await store.get(start.session_id)
    assert saved is not None
    assert saved.user is None


@pytest.mark.asyncio
async def test_complete_login_rejects_bad_issuer(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    service, store = build_session_service(public_pem=public_pem)
    start = await service.start_login()
    session = await store.get(start.session_id)
    assert session is not None
    token = mint_id_token(
        private_pem,
        issuer="https://evil.example",
        nonce=session.oidc_nonce,
    )

    # Act / Assert
    with pytest.raises(ValidationError):
        await service.complete_login(
            session_id=start.session_id,
            code=token,
            state=session.oidc_state or "",
        )


@pytest.mark.asyncio
async def test_complete_login_rejects_bad_audience(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    service, store = build_session_service(public_pem=public_pem)
    start = await service.start_login()
    session = await store.get(start.session_id)
    assert session is not None
    token = mint_id_token(
        private_pem,
        audience="wrong-client",
        nonce=session.oidc_nonce,
    )

    # Act / Assert
    with pytest.raises(ValidationError):
        await service.complete_login(
            session_id=start.session_id,
            code=token,
            state=session.oidc_state or "",
        )


@pytest.mark.asyncio
async def test_complete_login_rejects_expired_token(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    service, store = build_session_service(public_pem=public_pem)
    start = await service.start_login()
    session = await store.get(start.session_id)
    assert session is not None
    token = mint_id_token(
        private_pem,
        nonce=session.oidc_nonce,
        exp=int(time.time()) - 120,
    )

    # Act / Assert
    with pytest.raises(ValidationError):
        await service.complete_login(
            session_id=start.session_id,
            code=token,
            state=session.oidc_state or "",
        )


@pytest.mark.asyncio
async def test_complete_login_rejects_nonce_mismatch(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_keys
    service, store = build_session_service(public_pem=public_pem)
    start = await service.start_login()
    session = await store.get(start.session_id)
    assert session is not None
    token = mint_id_token(private_pem, nonce="other-nonce")

    # Act / Assert
    with pytest.raises(ValidationError) as exc:
        await service.complete_login(
            session_id=start.session_id,
            code=token,
            state=session.oidc_state or "",
        )
    assert exc.value.category == "nonce_mismatch"


@pytest.mark.asyncio
async def test_complete_login_rejects_missing_id_token(
    rsa_keys: tuple[bytes, bytes],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_keys
    clock = FixedClock(NOW)
    store = MemorySessionStore()
    validator = StaticAppOidcValidator(public_key_pem=public_pem, issuer=ISSUER)

    async def exchanger(_code: str, _verifier: str) -> dict[str, Any]:
        return {"access_token": "only-access"}

    service = SessionService(
        sessions=store,
        clock=clock,
        session_ttl_seconds=3600,
        authorize_url="http://idp/auth",
        token_url="http://idp/token",
        client_id=CLIENT_ID,
        client_secret="",
        redirect_uri="http://localhost:8000/auth/callback",
        issuer=ISSUER,
        oidc_validator=validator,
        token_exchanger=exchanger,
    )
    start = await service.start_login()
    session = await store.get(start.session_id)
    assert session is not None

    # Act / Assert
    with pytest.raises(ValidationError) as exc:
        await service.complete_login(
            session_id=start.session_id,
            code="unused",
            state=session.oidc_state or "",
        )
    assert exc.value.category == "missing_id_token"
