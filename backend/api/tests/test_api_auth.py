# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import time
from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fantasy_api.api.deps import (
    AppContainer,
    build_container,
    get_container,
    get_current_user,
    set_container,
)
from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.config import get_settings
from fantasy_api.domain.errors import NeedsReauthError, UnauthorizedError, UpstreamError
from fantasy_api.main import create_app, run
from fantasy_api.security.internal_jwt import (
    InternalJwtValidator,
)
from fantasy_api.services.leagues import LeaguesService
from fantasy_api.services.teams import TeamsService
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jwt_mint import (
    DEFAULT_TEST_AUDIENCE as AUDIENCE,
)
from jwt_mint import (
    DEFAULT_TEST_ISSUER as ISSUER,
)
from jwt_mint import (
    InvalidTokenError,
    mint_internal_jwt,
)
from test_container import TEST_SERVICE_TOKEN as SERVICE_TOKEN
from test_container import build_test_container
from test_container import test_settings as _test_settings


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

    container = build_test_container(
        public_pem,
        auth_handler=httpx.MockTransport(handler),
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
    token = mint_internal_jwt(
        private_pem,
        issuer=ISSUER,
        audience=AUDIENCE,
    )

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
    token = mint_internal_jwt(
        private_pem,
        issuer=ISSUER,
        audience=AUDIENCE,
    )

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


def test_health_ready_returns_ok(client: TestClient) -> None:
    # Arrange / Act
    response = client.get("/health/ready")

    # Assert
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_internal_jwt_validator_valid_token_returns_claims(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(
        private_pem,
        issuer=ISSUER,
        audience=AUDIENCE,
    )
    mock_signing_key = MagicMock()
    mock_signing_key.key = public_pem
    mock_client = MagicMock()
    mock_client.get_signing_key_from_jwt.return_value = mock_signing_key

    with patch(
        "fantasy_api.security.internal_jwt.PyJWKClient",
        return_value=mock_client,
    ):
        validator = InternalJwtValidator(
            jwks_url="http://auth.test/jwks",
            issuer=ISSUER,
            audience=AUDIENCE,
        )

        # Act
        claims = validator.validate(token)

    # Assert
    assert claims["sub"] == "app-user-1"
    mock_client.get_signing_key_from_jwt.assert_called_once_with(token)


def test_build_container_defaults_wires_services() -> None:
    # Arrange
    settings = _test_settings()

    # Act
    with patch("fantasy_api.security.internal_jwt.PyJWKClient"):
        container = build_container(settings)

    # Assert
    assert container.settings is settings
    assert isinstance(container.jwt_validator, InternalJwtValidator)
    assert isinstance(container.credentials, AuthCredentialsClient)
    assert isinstance(container.laliga_client, LaligaFantasyClient)
    assert isinstance(container.leagues_service, LeaguesService)
    assert isinstance(container.teams_service, TeamsService)


def test_get_container_when_unset_builds_default() -> None:
    # Arrange
    fake = MagicMock(spec=AppContainer)
    import fantasy_api.api.deps as deps

    with (
        patch.object(deps, "_container", None),
        patch.object(deps, "build_container", return_value=fake) as mock_build,
    ):
        # Act
        result = get_container()

    # Assert
    assert result is fake
    mock_build.assert_called_once_with()


def test_get_settings_returns_cached_instance() -> None:
    # Arrange
    get_settings.cache_clear()

    # Act
    first = get_settings()
    second = get_settings()

    # Assert
    assert first is second
    get_settings.cache_clear()


def test_run_starts_uvicorn() -> None:
    # Arrange / Act
    with patch("uvicorn.run") as mock_run:
        run()

    # Assert
    mock_run.assert_called_once_with(
        "fantasy_api.main:create_app",
        factory=True,
        host="0.0.0.0",
        port=8001,
        reload=False,
    )


def test_getattr_app_creates_application(rsa_pems: tuple[str, str]) -> None:
    # Arrange
    import fantasy_api.main as main_mod

    _private_pem, public_pem = rsa_pems
    settings = _test_settings()
    container = build_test_container(public_pem)

    with (
        patch.object(main_mod, "get_settings", return_value=settings),
        patch.object(main_mod, "build_container", return_value=container),
    ):
        # Act
        app = main_mod.__getattr__("app")  # pyright: ignore[reportCallIssue]

    # Assert
    assert isinstance(app, FastAPI)
    assert app.title == settings.app_name


def test_create_app_lifespan_builds_container_when_missing() -> None:
    # Arrange
    settings = _test_settings()
    fake_container = MagicMock(spec=AppContainer)
    fake_container.settings = settings
    fake_container.aclose = AsyncMock()

    with patch(
        "fantasy_api.main.build_container",
        return_value=fake_container,
    ) as mock_build:
        app = create_app(settings=settings)

        # Act
        with TestClient(app) as test_client:
            response = test_client.get("/health/ready")

    # Assert
    assert response.status_code == 200
    mock_build.assert_called_once_with(settings)


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
    token = mint_internal_jwt(
        other_pem,
        issuer=ISSUER,
        audience=AUDIENCE,
    )

    # Act
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

    # Assert
    assert response.status_code == 401


def test_me_rejects_empty_bearer_token(client: TestClient) -> None:
    # Arrange / Act
    response = client.get("/me", headers={"Authorization": "Bearer "})

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "unauthorized"


@pytest.mark.parametrize(
    ("issuer", "audience", "ttl_seconds"),
    [
        (ISSUER, AUDIENCE, -60),
        ("https://wrong-issuer.example", AUDIENCE, 300),
        (ISSUER, "not-fantasy-api", 300),
    ],
    ids=["expired", "wrong_issuer", "wrong_audience"],
)
def test_me_rejects_jwt_with_invalid_standard_claims(
    client: TestClient,
    rsa_pems: tuple[str, str],
    issuer: str,
    audience: str,
    ttl_seconds: int,
) -> None:
    # Arrange
    private_pem, _public_pem = rsa_pems
    token = mint_internal_jwt(
        private_pem,
        issuer=issuer,
        audience=audience,
        ttl_seconds=ttl_seconds,
    )

    # Act
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "unauthorized"


@pytest.mark.asyncio
async def test_get_current_user_missing_sub_raises_unauthorized(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems
    container = build_test_container(public_pem)
    fake_validator = MagicMock()
    fake_validator.validate.return_value = {"email": "u@example.com"}
    container.jwt_validator = fake_validator
    set_container(container)

    # Act / Assert
    with pytest.raises(UnauthorizedError, match="token missing sub"):
        await get_current_user("Bearer fake-token")


@pytest.mark.asyncio
async def test_credentials_client_maps_needs_reauth(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, _public_pem = rsa_pems

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
    token = mint_internal_jwt(
        private_pem,
        issuer=ISSUER,
        audience=AUDIENCE,
    )

    # Act / Assert
    with pytest.raises(NeedsReauthError):
        await client.get_laliga_bearer(token)


@pytest.mark.asyncio
async def test_credentials_client_401_non_reauth_raises_upstream(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, _public_pem = rsa_pems

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "unauthorized"})

    client = AuthCredentialsClient(
        base_url="http://auth.test",
        service_token=SERVICE_TOKEN,
        transport=httpx.MockTransport(handler),
    )
    token = mint_internal_jwt(
        private_pem,
        issuer=ISSUER,
        audience=AUDIENCE,
    )

    # Act / Assert
    with pytest.raises(UpstreamError, match="auth unauthorized") as exc_info:
        await client.get_laliga_bearer(token)
    assert exc_info.value.status_code == 401
    assert exc_info.value.category == "unauthorized"


@pytest.mark.asyncio
async def test_credentials_client_5xx_raises_upstream(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, _public_pem = rsa_pems

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="unavailable")

    client = AuthCredentialsClient(
        base_url="http://auth.test",
        service_token=SERVICE_TOKEN,
        transport=httpx.MockTransport(handler),
    )
    token = mint_internal_jwt(
        private_pem,
        issuer=ISSUER,
        audience=AUDIENCE,
    )

    # Act / Assert
    with pytest.raises(UpstreamError, match="auth credential request failed") as exc_info:
        await client.get_laliga_bearer(token)
    assert exc_info.value.status_code == 503
    assert exc_info.value.category == "auth_error"


@pytest.mark.asyncio
async def test_credentials_client_401_non_json_raises_upstream(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, _public_pem = rsa_pems

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="not-json", headers={"content-type": "text/plain"})

    client = AuthCredentialsClient(
        base_url="http://auth.test",
        service_token=SERVICE_TOKEN,
        transport=httpx.MockTransport(handler),
    )
    token = mint_internal_jwt(
        private_pem,
        issuer=ISSUER,
        audience=AUDIENCE,
    )

    # Act / Assert
    with pytest.raises(UpstreamError, match="auth unauthorized") as exc_info:
        await client.get_laliga_bearer(token)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_credentials_client_200_non_json_raises_upstream(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, _public_pem = rsa_pems

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>nope</html>")

    client = AuthCredentialsClient(
        base_url="http://auth.test",
        service_token=SERVICE_TOKEN,
        transport=httpx.MockTransport(handler),
    )
    token = mint_internal_jwt(
        private_pem,
        issuer=ISSUER,
        audience=AUDIENCE,
    )

    # Act / Assert
    with pytest.raises(UpstreamError, match="auth response was not JSON") as exc_info:
        await client.get_laliga_bearer(token)
    assert exc_info.value.status_code == 502
    assert exc_info.value.category == "auth_error"


def test_internal_jwt_validator_pyjwt_error_raises_unauthorized() -> None:
    # Arrange
    mock_client = MagicMock()
    mock_client.get_signing_key_from_jwt.side_effect = InvalidTokenError("bad jwt")

    with patch(
        "fantasy_api.security.internal_jwt.PyJWKClient",
        return_value=mock_client,
    ):
        validator = InternalJwtValidator(
            jwks_url="http://auth.test/jwks",
            issuer=ISSUER,
            audience=AUDIENCE,
        )

        # Act / Assert
        with pytest.raises(UnauthorizedError, match="bad jwt"):
            validator.validate("not-a-jwt")


def test_internal_jwt_validator_generic_exception_raises_unauthorized() -> None:
    # Arrange
    mock_client = MagicMock()
    mock_client.get_signing_key_from_jwt.side_effect = RuntimeError("jwks down")

    with patch(
        "fantasy_api.security.internal_jwt.PyJWKClient",
        return_value=mock_client,
    ):
        validator = InternalJwtValidator(
            jwks_url="http://auth.test/jwks",
            issuer=ISSUER,
            audience=AUDIENCE,
        )

        # Act / Assert
        with pytest.raises(UnauthorizedError, match="jwks validation failed"):
            validator.validate("token")


def test_credential_probe_needs_reauth_returns_http_401(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            json={"error": "needs_reauth", "detail": "no_laliga_connection"},
        )

    container = build_test_container(
        public_pem,
        auth_handler=httpx.MockTransport(handler),
    )
    app = create_app(settings=container.settings, container=container)
    set_container(container)
    token = mint_internal_jwt(
        private_pem,
        issuer=ISSUER,
        audience=AUDIENCE,
    )

    # Act
    with TestClient(app) as test_client:
        response = test_client.get(
            "/laliga/credential-probe",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 401
    assert response.json() == {
        "error": "needs_reauth",
        "detail": "no_laliga_connection",
    }


def test_credential_probe_upstream_error_returns_http_status(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(502, text="bad gateway")

    container = build_test_container(
        public_pem,
        auth_handler=httpx.MockTransport(handler),
    )
    app = create_app(settings=container.settings, container=container)
    set_container(container)
    token = mint_internal_jwt(
        private_pem,
        issuer=ISSUER,
        audience=AUDIENCE,
    )

    # Act
    with TestClient(app) as test_client:
        response = test_client.get(
            "/laliga/credential-probe",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 502
    assert response.json()["error"] == "auth_error"


# ---- Edge cases ---- #


def test_health_ok(client: TestClient) -> None:
    # Arrange / Act
    response = client.get("/health")

    # Assert
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_credentials_client_401_json_array_raises_upstream(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange — JSON array exercises _safe_json non-dict branch
    private_pem, _public_pem = rsa_pems

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json=["not", "a", "dict"])

    client = AuthCredentialsClient(
        base_url="http://auth.test",
        service_token=SERVICE_TOKEN,
        transport=httpx.MockTransport(handler),
    )
    token = mint_internal_jwt(
        private_pem,
        issuer=ISSUER,
        audience=AUDIENCE,
    )

    # Act / Assert
    with pytest.raises(UpstreamError, match="auth unauthorized"):
        await client.get_laliga_bearer(token)
