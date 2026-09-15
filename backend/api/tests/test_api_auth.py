# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import time
from typing import Iterator

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from fantasy_api.api.deps import AppContainer, set_container
from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.config import Settings
from fantasy_api.domain.errors import NeedsReauthError
from fantasy_api.main import create_app
from fantasy_api.security.internal_jwt import StaticInternalJwtValidator

ISSUER = "https://auth.fantasy-builder.local"
AUDIENCE = "fantasy-api"
SERVICE_TOKEN = "api-service-token"


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


def mint_internal_jwt(private_pem: str, *, sub: str = "app-user-1") -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": sub,
            "email": "u@example.com",
            "name": "User",
            "iss": ISSUER,
            "aud": AUDIENCE,
            "iat": now,
            "exp": now + 300,
        },
        private_pem,
        algorithm="RS256",
    )


def build_api_container(
    public_pem: str,
    *,
    transport: httpx.MockTransport | None = None,
) -> AppContainer:
    settings = Settings(
        auth_jwks_url="http://auth.test/jwks",
        internal_jwt_issuer=ISSUER,
        internal_jwt_audience=AUDIENCE,
        auth_internal_base_url="http://auth.test",
        internal_service_token=SERVICE_TOKEN,
        log_json=False,
    )
    validator = StaticInternalJwtValidator(
        public_key_pem=public_pem,
        issuer=ISSUER,
        audience=AUDIENCE,
    )
    credentials = AuthCredentialsClient(
        base_url=settings.auth_internal_base_url,
        service_token=SERVICE_TOKEN,
        transport=transport,
    )
    return AppContainer(
        settings=settings,
        jwt_validator=validator,
        credentials=credentials,
    )


@pytest.fixture
def client(rsa_pems: tuple[str, str]) -> Iterator[TestClient]:
    _private_pem, public_pem = rsa_pems

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("X-Service-Token") == SERVICE_TOKEN
        assert request.headers.get("Authorization", "").startswith("Bearer ")
        return httpx.Response(
            200,
            json={
                "bearer_token": "laliga-tok",
                "expires_at": int(time.time()) + 100,
                "token_type": "Bearer",
            },
        )

    container = build_api_container(
        public_pem,
        transport=httpx.MockTransport(handler),
    )
    app = create_app(settings=container.settings, container=container)
    set_container(container)
    with TestClient(app) as test_client:
        yield test_client


# ---- Happy path ---- #


def test_me_returns_user_from_jwt(
    client: TestClient,
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, _public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    # Act
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

    # Assert
    assert response.status_code == 200
    assert response.json()["user_id"] == "app-user-1"


def test_credential_probe_fetches_bearer(
    client: TestClient,
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, _public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    # Act
    response = client.get(
        "/laliga/credential-probe",
        headers={"Authorization": f"Bearer {token}"},
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["has_bearer"] is True
    assert "bearer_token" not in body


# ---- Error paths ---- #


def test_me_rejects_missing_bearer(client: TestClient) -> None:
    # Arrange / Act
    response = client.get("/me")

    # Assert
    assert response.status_code == 401


def test_me_rejects_bad_signature(
    client: TestClient,
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_pem = other.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    token = mint_internal_jwt(other_pem)

    # Act
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

    # Assert
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_credentials_client_maps_needs_reauth(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            json={"error": "needs_reauth", "detail": "no_laliga_connection"},
        )

    client = AuthCredentialsClient(
        base_url="http://auth.test",
        service_token=SERVICE_TOKEN,
        transport=httpx.MockTransport(handler),
    )
    token = mint_internal_jwt(private_pem)

    # Act / Assert
    with pytest.raises(NeedsReauthError):
        await client.get_laliga_bearer(token)
    del public_pem


# ---- Edge cases ---- #


def test_health_ok(client: TestClient) -> None:
    # Arrange / Act
    response = client.get("/health")

    # Assert
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
