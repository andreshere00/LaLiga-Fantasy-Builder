# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import time
from typing import Any
from unittest.mock import MagicMock

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fantasy_auth.adapters.jwks import AppOidcJwksValidator, B2CJwksValidator
from fantasy_auth.domain.errors import ValidationError

ISSUER = "https://idp.example.com/realms/fantasy"
AUDIENCE = "app-client"
B2C_ISSUER = "https://login.laliga.es/tenant/v2.0/"
POLICY = "B2C_1A_SIGNIN"
NOW = int(time.time())


@pytest.fixture
def rsa_pems() -> tuple[str, str]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = (
        key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    return private_pem, public_pem


def mint_oidc(
    private_pem: str,
    *,
    nonce: str | None = "nonce-1",
    sub: str = "user-1",
) -> str:
    payload: dict[str, Any] = {
        "sub": sub,
        "iss": ISSUER,
        "aud": AUDIENCE,
        "exp": NOW + 3600,
        "iat": NOW,
    }
    if nonce is not None:
        payload["nonce"] = nonce
    return jwt.encode(payload, private_pem, algorithm="RS256")


def mint_b2c(private_pem: str, *, nonce: str | None = "n-1") -> str:
    payload: dict[str, Any] = {
        "sub": "b2c-sub",
        "iss": B2C_ISSUER,
        "aud": AUDIENCE,
        "exp": NOW + 3600,
        "iat": NOW,
    }
    if nonce is not None:
        payload["nonce"] = nonce
    return jwt.encode(payload, private_pem, algorithm="RS256")


def _signing_key(public_pem: str) -> MagicMock:
    key = MagicMock()
    key.key = public_pem
    return key


# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_app_oidc_validate_happy_returns_claims(
    rsa_pems: tuple[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_oidc(private_pem)
    client = MagicMock()
    client.get_signing_key_from_jwt.return_value = _signing_key(public_pem)
    monkeypatch.setattr(
        "fantasy_auth.adapters.jwks.PyJWKClient",
        lambda *a, **k: client,
    )
    validator = AppOidcJwksValidator(jwks_url="https://idp/jwks", issuer=ISSUER)

    # Act
    claims = await validator.validate(token, audience=AUDIENCE, nonce="nonce-1")

    # Assert
    assert claims["sub"] == "user-1"
    assert claims["nonce"] == "nonce-1"


@pytest.mark.asyncio
async def test_b2c_validate_happy_returns_claims(
    rsa_pems: tuple[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_b2c(private_pem)
    client = MagicMock()
    client.get_signing_key_from_jwt.return_value = _signing_key(public_pem)
    monkeypatch.setattr(
        "fantasy_auth.adapters.jwks.PyJWKClient",
        lambda *a, **k: client,
    )
    validator = B2CJwksValidator(
        discovery_base="https://login.laliga.es/tenant",
        issuer=B2C_ISSUER,
    )

    # Act
    claims = await validator.validate(token, policy=POLICY, audience=AUDIENCE, nonce="n-1")

    # Assert
    assert claims["sub"] == "b2c-sub"
    await validator.validate(token, policy=POLICY, audience=AUDIENCE)
    assert len(validator._jwks_clients) == 1


def test_b2c_jwks_and_discovery_urls() -> None:
    # Arrange
    validator = B2CJwksValidator(
        discovery_base="https://login.laliga.es/tenant/",
        issuer=B2C_ISSUER,
    )

    # Act / Assert
    assert validator.jwks_url(POLICY).endswith(f"keys?p={POLICY}")
    assert "openid-configuration" in validator.discovery_url(POLICY)
    assert f"p={POLICY}" in validator.discovery_url(POLICY)


# ---- Error paths ---- #


@pytest.mark.asyncio
async def test_app_oidc_validate_pyjwt_error_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    client = MagicMock()
    client.get_signing_key_from_jwt.side_effect = jwt.InvalidTokenError("bad")
    monkeypatch.setattr(
        "fantasy_auth.adapters.jwks.PyJWKClient",
        lambda *a, **k: client,
    )
    validator = AppOidcJwksValidator(jwks_url="https://idp/jwks", issuer=ISSUER)

    # Act / Assert
    with pytest.raises(ValidationError) as exc:
        await validator.validate("not.a.jwt", audience=AUDIENCE)
    assert exc.value.category == "jwt_invalid"


@pytest.mark.asyncio
async def test_app_oidc_validate_generic_exception_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    client = MagicMock()
    client.get_signing_key_from_jwt.side_effect = RuntimeError("network")
    monkeypatch.setattr(
        "fantasy_auth.adapters.jwks.PyJWKClient",
        lambda *a, **k: client,
    )
    validator = AppOidcJwksValidator(jwks_url="https://idp/jwks", issuer=ISSUER)

    # Act / Assert
    with pytest.raises(ValidationError) as exc:
        await validator.validate("tok", audience=AUDIENCE)
    assert exc.value.category == "jwks_error"


@pytest.mark.asyncio
async def test_app_oidc_validate_nonce_mismatch_raises(
    rsa_pems: tuple[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_oidc(private_pem, nonce="expected")
    client = MagicMock()
    client.get_signing_key_from_jwt.return_value = _signing_key(public_pem)
    monkeypatch.setattr(
        "fantasy_auth.adapters.jwks.PyJWKClient",
        lambda *a, **k: client,
    )
    validator = AppOidcJwksValidator(jwks_url="https://idp/jwks", issuer=ISSUER)

    # Act / Assert
    with pytest.raises(ValidationError, match="nonce mismatch") as exc:
        await validator.validate(token, audience=AUDIENCE, nonce="other")
    assert exc.value.category == "nonce_mismatch"


@pytest.mark.asyncio
async def test_b2c_validate_pyjwt_error_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    client = MagicMock()
    client.get_signing_key_from_jwt.side_effect = jwt.DecodeError("bad")
    monkeypatch.setattr(
        "fantasy_auth.adapters.jwks.PyJWKClient",
        lambda *a, **k: client,
    )
    validator = B2CJwksValidator(
        discovery_base="https://login.laliga.es/tenant",
        issuer=B2C_ISSUER,
    )

    # Act / Assert
    with pytest.raises(ValidationError) as exc:
        await validator.validate("bad", policy=POLICY, audience=AUDIENCE)
    assert exc.value.category == "jwt_invalid"


@pytest.mark.asyncio
async def test_b2c_validate_generic_exception_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    client = MagicMock()
    client.get_signing_key_from_jwt.side_effect = OSError("down")
    monkeypatch.setattr(
        "fantasy_auth.adapters.jwks.PyJWKClient",
        lambda *a, **k: client,
    )
    validator = B2CJwksValidator(
        discovery_base="https://login.laliga.es/tenant",
        issuer=B2C_ISSUER,
    )

    # Act / Assert
    with pytest.raises(ValidationError) as exc:
        await validator.validate("tok", policy=POLICY, audience=AUDIENCE)
    assert exc.value.category == "jwks_error"


@pytest.mark.asyncio
async def test_b2c_validate_nonce_mismatch_raises(
    rsa_pems: tuple[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_b2c(private_pem, nonce="a")
    client = MagicMock()
    client.get_signing_key_from_jwt.return_value = _signing_key(public_pem)
    monkeypatch.setattr(
        "fantasy_auth.adapters.jwks.PyJWKClient",
        lambda *a, **k: client,
    )
    validator = B2CJwksValidator(
        discovery_base="https://login.laliga.es/tenant",
        issuer=B2C_ISSUER,
    )

    # Act / Assert
    with pytest.raises(ValidationError, match="nonce mismatch"):
        await validator.validate(token, policy=POLICY, audience=AUDIENCE, nonce="b")
