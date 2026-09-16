# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import time
from collections.abc import Callable

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fantasy_api.api.deps import AppContainer, set_container
from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.config import Settings
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.main import create_app
from fantasy_api.repositories.leagues import LeaguesRepository
from fantasy_api.repositories.players import PlayersRepository
from fantasy_api.security.internal_jwt import StaticInternalJwtValidator
from fantasy_api.services.leagues import LeaguesService
from fantasy_api.services.players import PlayersService
from fastapi.testclient import TestClient

ISSUER = "https://auth.fantasy-builder.local"
AUDIENCE = "fantasy-api"
SERVICE_TOKEN = "api-service-token"
FANTASY_ORIGIN = "https://fantasy.test"
LALIGA_BEARER = "laliga-secret-token"


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


def mint_internal_jwt(
    private_pem: str,
    *,
    sub: str = "app-user-1",
    issuer: str = ISSUER,
    audience: str = AUDIENCE,
    ttl_seconds: int = 300,
) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": sub,
            "email": "u@example.com",
            "name": "User",
            "iss": issuer,
            "aud": audience,
            "iat": now,
            "exp": now + ttl_seconds,
        },
        private_pem,
        algorithm="RS256",
    )


def _auth_ok_handler(request: httpx.Request) -> httpx.Response:
    assert request.url.path == "/internal/laliga/bearer"
    assert request.headers.get("X-Service-Token") == SERVICE_TOKEN
    assert request.headers.get("Authorization", "").startswith("Bearer ")
    return httpx.Response(
        200,
        json={
            "bearer_token": LALIGA_BEARER,
            "expires_at": int(time.time()) + 100,
            "token_type": "Bearer",
        },
    )


def _auth_needs_reauth_handler(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        401,
        json={"error": "needs_reauth", "detail": "pair again"},
    )


def _auth_must_not_be_called(_request: httpx.Request) -> httpx.Response:
    raise AssertionError("auth credentials must not be requested for public player reads")


def build_players_container(
    public_pem: str,
    *,
    fantasy_handler: httpx.MockTransport | None = None,
    auth_handler: httpx.MockTransport | None = None,
) -> AppContainer:
    settings = Settings(
        auth_jwks_url="http://auth.test/jwks",
        internal_jwt_issuer=ISSUER,
        internal_jwt_audience=AUDIENCE,
        auth_internal_base_url="http://auth.test",
        internal_service_token=SERVICE_TOKEN,
        laliga_fantasy_origin=FANTASY_ORIGIN,
        laliga_competition_id=1,
        log_json=False,
    )
    credentials = AuthCredentialsClient(
        base_url=settings.auth_internal_base_url,
        service_token=SERVICE_TOKEN,
        transport=auth_handler or httpx.MockTransport(_auth_ok_handler),
    )
    laliga_client = LaligaFantasyClient(
        origin=settings.laliga_fantasy_origin,
        transport=fantasy_handler,
    )
    return AppContainer(
        settings=settings,
        jwt_validator=StaticInternalJwtValidator(
            public_key_pem=public_pem,
            issuer=ISSUER,
            audience=AUDIENCE,
        ),
        credentials=credentials,
        laliga_client=laliga_client,
        leagues_service=LeaguesService(
            credentials,
            LeaguesRepository(
                laliga_client,
                competition_id=settings.laliga_competition_id,
            ),
        ),
        players_service=PlayersService(
            credentials,
            PlayersRepository(
                laliga_client,
                competition_id=settings.laliga_competition_id,
            ),
        ),
    )


def make_client(
    public_pem: str,
    fantasy_handler: Callable[[httpx.Request], httpx.Response],
    *,
    auth_handler: Callable[[httpx.Request], httpx.Response] | None = None,
) -> TestClient:
    container = build_players_container(
        public_pem,
        fantasy_handler=httpx.MockTransport(fantasy_handler),
        auth_handler=httpx.MockTransport(auth_handler) if auth_handler is not None else None,
    )
    app = create_app(settings=container.settings, container=container)
    set_container(container)
    return TestClient(app)


# ---- Happy path ---- #


def test_list_players_proxies_public_catalog(rsa_pems: tuple[str, str]) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems
    payload = [
        {
            "id": "68",
            "nickname": "Unai Simón",
            "playerStatus": "ok",
            "marketValue": "49703931",
            "points": 38,
        }
    ]

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/competition/1/players"
        assert "Authorization" not in request.headers
        assert request.headers["Accept"] == "application/json"
        assert request.headers["x-lang"] == "es"
        return httpx.Response(200, json=payload)

    with make_client(public_pem, fantasy_handler, auth_handler=_auth_must_not_be_called) as client:
        # Act
        response = client.get("/players")

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body[0]["id"] == "68"
    assert body[0]["playerStatus"] == "ok"
    assert body[0]["marketValue"] == "49703931"
    assert body[0]["points"] == 38
    assert LALIGA_BEARER not in response.text


def test_get_market_value_proxies_public_history(rsa_pems: tuple[str, str]) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems
    payload = [
        {
            "lfpId": 3000068,
            "marketValue": 20000000,
            "date": "2026-06-29T00:00:00+02:00",
            "bids": 0,
        }
    ]

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/competition/1/player/68/market-value"
        assert "Authorization" not in request.headers
        return httpx.Response(200, json=payload)

    with make_client(public_pem, fantasy_handler, auth_handler=_auth_must_not_be_called) as client:
        # Act
        response = client.get("/player/68/market-value")

    # Assert
    assert response.status_code == 200
    assert response.json()[0]["marketValue"] == 20000000
    assert LALIGA_BEARER not in response.text


def test_get_player_in_league_proxies_authenticated_card(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    payload = {"id": "68", "playerTeamId": "pt-1", "buyoutClause": 99}

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/competition/1/player/68/league/42"
        assert request.headers["Authorization"] == f"Bearer {LALIGA_BEARER}"
        return httpx.Response(200, json=payload)

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/player/68/league/42",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "68"
    assert body["playerTeamId"] == "pt-1"
    assert body["buyoutClause"] == 99
    assert LALIGA_BEARER not in response.text


@pytest.mark.asyncio
async def test_laliga_fantasy_client_get_json_omits_authorization_when_public() -> None:
    # Arrange
    seen: dict[str, bool] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["has_authorization"] = "Authorization" in request.headers
        return httpx.Response(200, json={"ok": True})

    client = LaligaFantasyClient(
        origin=FANTASY_ORIGIN,
        transport=httpx.MockTransport(handler),
    )

    # Act
    data = await client.get_json("/api/v1/competition/1/players")

    # Assert
    assert data == {"ok": True}
    assert seen["has_authorization"] is False


@pytest.mark.asyncio
async def test_players_repository_list_players_builds_competition_path() -> None:
    # Arrange
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["authorization"] = request.headers.get("Authorization", "")
        return httpx.Response(200, json=[])

    repo = PlayersRepository(
        LaligaFantasyClient(
            origin=FANTASY_ORIGIN,
            transport=httpx.MockTransport(handler),
        ),
        competition_id=1,
    )

    # Act
    data = await repo.list_players()

    # Assert
    assert data == []
    assert seen["url"] == f"{FANTASY_ORIGIN}/api/v1/competition/1/players"
    assert seen["authorization"] == ""


@pytest.mark.asyncio
async def test_players_repository_encodes_path_ids() -> None:
    # Arrange
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.raw_path.decode())
        return httpx.Response(200, json=[])

    repo = PlayersRepository(
        LaligaFantasyClient(
            origin=FANTASY_ORIGIN,
            transport=httpx.MockTransport(handler),
        ),
        competition_id=1,
    )

    # Act
    await repo.get_market_value("a/b")
    await repo.get_player_in_league("tok", "x y", "t?z")

    # Assert
    assert seen == [
        "/api/v1/competition/1/player/a%2Fb/market-value",
        "/api/v1/competition/1/player/x%20y/league/t%3Fz",
    ]


# ---- Error paths ---- #


def test_get_player_in_league_rejects_missing_bearer(rsa_pems: tuple[str, str]) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("Fantasy must not be called without a JWT")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/player/68/league/42")

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "unauthorized"


def test_get_player_in_league_maps_needs_reauth(rsa_pems: tuple[str, str]) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    container = build_players_container(
        public_pem,
        fantasy_handler=httpx.MockTransport(lambda _r: httpx.Response(200, json={})),
        auth_handler=httpx.MockTransport(_auth_needs_reauth_handler),
    )
    app = create_app(settings=container.settings, container=container)
    set_container(container)

    with TestClient(app) as client:
        # Act
        response = client.get(
            "/player/68/league/42",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "needs_reauth"
    assert LALIGA_BEARER not in response.text


def test_list_players_maps_fantasy_server_error(rsa_pems: tuple[str, str]) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="upstream detail")

    with make_client(public_pem, fantasy_handler, auth_handler=_auth_must_not_be_called) as client:
        # Act
        response = client.get("/players")

    # Assert
    assert response.status_code == 503
    assert response.json()["error"] == "fantasy_error"
    assert "upstream detail" not in response.text


def test_get_market_value_maps_fantasy_unauthorized(rsa_pems: tuple[str, str]) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="nope")

    with make_client(public_pem, fantasy_handler, auth_handler=_auth_must_not_be_called) as client:
        # Act
        response = client.get("/player/68/market-value")

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "fantasy_unauthorized"
    assert "nope" not in response.text


def test_list_players_maps_unexpected_payload_to_upstream_error(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json="not-a-collection")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/players")

    # Assert
    assert response.status_code == 502
    assert response.json()["error"] == "fantasy_error"
    assert response.json()["detail"] == "fantasy payload had an unexpected shape"


def test_get_player_in_league_rejects_non_object_payload(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"id": "68"}])

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/player/68/league/42",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 502
    assert response.json()["error"] == "fantasy_error"


@pytest.mark.asyncio
async def test_laliga_fantasy_client_get_json_raises_upstream_on_500() -> None:
    # Arrange
    client = LaligaFantasyClient(
        origin=FANTASY_ORIGIN,
        transport=httpx.MockTransport(lambda _r: httpx.Response(500)),
    )

    # Act / Assert
    with pytest.raises(UpstreamError) as exc_info:
        await client.get_json("/x")
    assert exc_info.value.status_code == 500
    assert exc_info.value.category == "fantasy_error"


# ---- Edge cases ---- #


def test_list_players_unwraps_data_wrapper(rsa_pems: tuple[str, str]) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"id": "1"}, {"id": "2"}]})

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/players")

    # Assert
    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == ["1", "2"]


def test_get_player_in_league_rejects_invalid_jwt(rsa_pems: tuple[str, str]) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/player/68/league/42",
            headers={"Authorization": "Bearer not-a-jwt"},
        )

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "unauthorized"
