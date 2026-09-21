# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json
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
from fantasy_api.repositories.teams import TeamsRepository
from fantasy_api.security.internal_jwt import StaticInternalJwtValidator
from fantasy_api.services.leagues import LeaguesService
from fantasy_api.services.players import PlayersService
from fantasy_api.services.teams import TeamsService
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


def _auth_needs_reauth_handler(request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        401,
        json={"error": "needs_reauth", "detail": "pair again"},
    )


def build_teams_container(
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
        teams_service=TeamsService(
            credentials,
            TeamsRepository(
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


def _valid_lineup_payload() -> dict[str, object]:
    return {
        "goalkeeper": "pt-1",
        "defender": ["pt-2", "pt-3", "pt-4", "pt-5"],
        "midfield": ["pt-6", "pt-7", "pt-8"],
        "striker": ["pt-9", "pt-10", "pt-11"],
        "tactical_formation": [4, 3, 3],
    }


def make_client(
    public_pem: str,
    fantasy_handler: Callable[[httpx.Request], httpx.Response],
) -> TestClient:
    container = build_teams_container(
        public_pem,
        fantasy_handler=httpx.MockTransport(fantasy_handler),
    )
    app = create_app(settings=container.settings, container=container)
    set_container(container)
    return TestClient(app)


# ---- Happy path ---- #


@pytest.mark.parametrize(
    ("path", "expected_suffix", "upstream", "expected"),
    [
        (
            "/teams/99/money",
            "/api/v1/competition/1/teams/99/money",
            {"teamMoney": 1_000_000, "teamInvestment": 50_000},
            {"teamMoney": 1_000_000, "teamInvestment": 50_000},
        ),
        (
            "/teams/99/lineup",
            "/api/v1/competition/1/teams/99/lineup",
            {"formation": {"tacticalFormation": [4, 3, 3]}},
            {"formation": {"tacticalFormation": [4, 3, 3]}},
        ),
        (
            "/teams/99/lineup/week/5",
            "/api/v1/competition/1/teams/99/lineup/week/5",
            {"weekNumber": 5, "formation": {"goalkeeper": []}},
            {"weekNumber": 5},
        ),
    ],
)
def test_team_get_routes_proxy_expected_fantasy_paths(
    rsa_pems: tuple[str, str],
    path: str,
    expected_suffix: str,
    upstream: object,
    expected: object,
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == expected_suffix
        assert request.headers["Authorization"] == f"Bearer {LALIGA_BEARER}"
        assert request.headers["x-lang"] == "es"
        return httpx.Response(200, json=upstream)

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(path, headers={"Authorization": f"Bearer {token}"})

    # Assert
    assert response.status_code == 200
    body = response.json()
    for key, value in expected.items():
        assert body[key] == value
    assert LALIGA_BEARER not in response.text


def test_put_lineup_proxies_json_body(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    payload = _valid_lineup_payload()

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "PUT"
        assert request.url.path == "/api/v1/competition/1/teams/99/lineup"
        assert request.headers["Authorization"] == f"Bearer {LALIGA_BEARER}"
        assert request.headers["Content-Type"] == "application/json"
        assert request.headers["x-lang"] == "es"
        assert json.loads(request.content.decode()) == payload
        return httpx.Response(200, json={"formation": {"tacticalFormation": [4, 3, 3]}})

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.put(
            "/teams/99/lineup",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )

    # Assert
    assert response.status_code == 200
    assert response.json()["formation"]["tacticalFormation"] == [4, 3, 3]
    assert LALIGA_BEARER not in response.text


def test_put_lineup_empty_success_body_returns_empty_object(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "PUT"
        return httpx.Response(204)

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.put(
            "/teams/99/lineup",
            headers={"Authorization": f"Bearer {token}"},
            json=_valid_lineup_payload(),
        )

    # Assert
    assert response.status_code == 200
    assert response.json() == {}
    assert LALIGA_BEARER not in response.text


def test_put_lineup_rejects_extra_keys(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("Fantasy must not be called for invalid body")

    payload = {**_valid_lineup_payload(), "unexpected": "value"}

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.put(
            "/teams/99/lineup",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )

    # Assert
    assert response.status_code == 422


def test_put_lineup_rejects_incomplete_body(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("Fantasy must not be called for incomplete body")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.put(
            "/teams/99/lineup",
            headers={"Authorization": f"Bearer {token}"},
            json={"goalkeeper": "pt-1"},
        )

    # Assert
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_teams_repository_get_money_encodes_path_ids() -> None:
    # Arrange
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.raw_path.decode())
        return httpx.Response(200, json={})

    repo = TeamsRepository(
        LaligaFantasyClient(
            origin=FANTASY_ORIGIN,
            transport=httpx.MockTransport(handler),
        ),
        competition_id=1,
    )

    # Act
    await repo.get_money("tok", "t?z")
    await repo.get_lineup("tok", "a/b")

    # Assert
    assert seen == [
        "/api/v1/competition/1/teams/t%3Fz/money",
        "/api/v1/competition/1/teams/a%2Fb/lineup",
    ]


@pytest.mark.asyncio
async def test_laliga_fantasy_client_put_json_returns_body() -> None:
    # Arrange
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "PUT"
        assert request.headers["Content-Type"] == "application/json"
        assert json.loads(request.content.decode()) == {"goalkeeper": "1"}
        return httpx.Response(200, json={"ok": True})

    client = LaligaFantasyClient(
        origin=FANTASY_ORIGIN,
        transport=httpx.MockTransport(handler),
    )

    # Act
    data = await client.put_json(
        "/api/v1/competition/1/teams/1/lineup",
        "tok",
        {
            "goalkeeper": "1",
        },
    )

    # Assert
    assert data == {"ok": True}


@pytest.mark.asyncio
async def test_laliga_fantasy_client_put_json_empty_body_returns_object() -> None:
    # Arrange
    client = LaligaFantasyClient(
        origin=FANTASY_ORIGIN,
        transport=httpx.MockTransport(lambda _r: httpx.Response(204)),
    )

    # Act
    data = await client.put_json("/x", "tok", {"a": 1})

    # Assert
    assert data == {}


# ---- Error paths ---- #


def test_get_money_rejects_missing_bearer(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/teams/99/money")

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "unauthorized"


def test_get_money_maps_needs_reauth(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    container = build_teams_container(
        public_pem,
        fantasy_handler=httpx.MockTransport(
            lambda _r: httpx.Response(200, json={}),
        ),
        auth_handler=httpx.MockTransport(_auth_needs_reauth_handler),
    )
    app = create_app(settings=container.settings, container=container)
    set_container(container)

    with TestClient(app) as client:
        # Act
        response = client.get(
            "/teams/99/money",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "needs_reauth"
    assert LALIGA_BEARER not in response.text


def test_get_lineup_maps_fantasy_unauthorized(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="nope")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/teams/99/lineup",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "fantasy_unauthorized"
    assert "nope" not in response.text
    assert LALIGA_BEARER not in response.text


def test_get_money_maps_fantasy_server_error(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="upstream detail")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/teams/99/money",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 503
    assert response.json()["error"] == "fantasy_error"
    assert "upstream detail" not in response.text


def test_get_money_rejects_non_object_payload(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"teamMoney": 1}])

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/teams/99/money",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 502
    assert response.json()["error"] == "fantasy_error"


@pytest.mark.asyncio
async def test_laliga_fantasy_client_get_json_empty_body_raises_upstream() -> None:
    # Arrange
    client = LaligaFantasyClient(
        origin=FANTASY_ORIGIN,
        transport=httpx.MockTransport(lambda _r: httpx.Response(200)),
    )

    # Act / Assert
    with pytest.raises(UpstreamError, match="fantasy response was not JSON") as exc_info:
        await client.get_json("/x", "tok")
    assert exc_info.value.status_code == 502
    assert exc_info.value.category == "fantasy_error"


@pytest.mark.asyncio
async def test_laliga_fantasy_client_put_json_raises_upstream_on_401() -> None:
    # Arrange
    client = LaligaFantasyClient(
        origin=FANTASY_ORIGIN,
        transport=httpx.MockTransport(lambda _r: httpx.Response(401)),
    )

    # Act / Assert
    with pytest.raises(UpstreamError) as exc_info:
        await client.put_json("/x", "tok", {"a": 1})
    assert exc_info.value.status_code == 401
    assert exc_info.value.category == "fantasy_unauthorized"


@pytest.mark.asyncio
async def test_laliga_fantasy_client_put_json_raises_upstream_on_invalid_json() -> None:
    # Arrange
    client = LaligaFantasyClient(
        origin=FANTASY_ORIGIN,
        transport=httpx.MockTransport(
            lambda _r: httpx.Response(200, text="<html>nope</html>"),
        ),
    )

    # Act / Assert
    with pytest.raises(UpstreamError, match="fantasy response was not JSON") as exc_info:
        await client.put_json("/x", "tok", {"a": 1})
    assert exc_info.value.status_code == 502
    assert exc_info.value.category == "fantasy_error"


# ---- Edge cases ---- #


def test_lineup_by_week_rejects_non_positive_week(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("Fantasy must not be called for invalid week")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/teams/99/lineup/week/0")

    # Assert
    assert response.status_code == 422
