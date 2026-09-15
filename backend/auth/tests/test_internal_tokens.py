# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from fantasy_auth.adapters.internal_jwt import Rs256InternalJwt
from fantasy_auth.adapters.memory import FixedClock
from fantasy_auth.application.internal_tokens import InternalTokenService
from fantasy_auth.domain.errors import ValidationError
from fantasy_auth.domain.users import AppUser

ISSUER = "https://auth.fantasy-builder.local"
AUDIENCE = "fantasy-api"
NOW = int(time.time())


@pytest.fixture
def rsa_pems() -> tuple[str, str]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


def build_service(private_pem: str, public_pem: str) -> InternalTokenService:
    adapter = Rs256InternalJwt(
        private_key_pem=private_pem,
        public_key_pem=public_pem,
        issuer=ISSUER,
        audience=AUDIENCE,
        ttl_seconds=300,
    )
    return InternalTokenService(
        issuer=adapter,
        validator=adapter,
        clock=FixedClock(NOW),
    )


# ---- Happy path ---- #


def test_issue_for_user_returns_verifiable_jwt(rsa_pems: tuple[str, str]) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    service = build_service(private_pem, public_pem)
    user = AppUser(user_id="u-1", email="a@b.c", name="A")

    # Act
    issued = service.issue_for_user(user)
    resolved = service.user_from_token(issued.access_token)

    # Assert
    assert issued.token_type == "Bearer"
    assert issued.expires_in == 300
    assert issued.expires_at == NOW + 300
    assert resolved == user
    jwks = service.public_jwks()
    assert "keys" in jwks
    assert jwks["keys"][0]["kty"] == "RSA"


# ---- Error paths ---- #


def test_user_from_token_rejects_bad_audience(rsa_pems: tuple[str, str]) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    service = build_service(private_pem, public_pem)
    token = jwt.encode(
        {
            "sub": "u-1",
            "iss": ISSUER,
            "aud": "wrong",
            "iat": NOW,
            "exp": NOW + 100,
        },
        private_pem,
        algorithm="RS256",
    )

    # Act / Assert
    with pytest.raises(ValidationError):
        service.user_from_token(token)


def test_user_from_token_rejects_expired(rsa_pems: tuple[str, str]) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    service = build_service(private_pem, public_pem)
    token = jwt.encode(
        {
            "sub": "u-1",
            "iss": ISSUER,
            "aud": AUDIENCE,
            "iat": int(time.time()) - 120,
            "exp": int(time.time()) - 60,
        },
        private_pem,
        algorithm="RS256",
    )

    # Act / Assert
    with pytest.raises(ValidationError):
        service.user_from_token(token)


def test_user_from_token_rejects_bad_issuer(rsa_pems: tuple[str, str]) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    service = build_service(private_pem, public_pem)
    token = jwt.encode(
        {
            "sub": "u-1",
            "iss": "https://evil.example",
            "aud": AUDIENCE,
            "iat": NOW,
            "exp": NOW + 100,
        },
        private_pem,
        algorithm="RS256",
    )

    # Act / Assert
    with pytest.raises(ValidationError):
        service.user_from_token(token)


# ---- Edge cases ---- #


def test_public_jwks_includes_kid(rsa_pems: tuple[str, str]) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    service = build_service(private_pem, public_pem)

    # Act
    jwks = service.public_jwks()

    # Assert
    assert jwks["keys"][0]["kid"]
    assert jwks["keys"][0]["alg"] == "RS256"
