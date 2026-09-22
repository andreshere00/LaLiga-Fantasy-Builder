# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from collections.abc import Callable

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fantasy_api.api.deps import set_container
from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.main import create_app
from fantasy_api.repositories.players import PlayersRepository
from fastapi.testclient import TestClient
from jwt_mint import mint_internal_jwt
from test_container import (
    TEST_FANTASY_ORIGIN as FANTASY_ORIGIN,
)
from test_container import (
    TEST_LALIGA_BEARER as LALIGA_BEARER,
)
from test_container import (
    build_test_container,
)


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


def _auth_needs_reauth_handler(request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        401,
        json={"error": "needs_reauth", "detail": "pair again"},
    )


def make_client(
    public_pem: str,
    fantasy_handler: Callable[[httpx.Request], httpx.Response],
    *,
    auth_handler: httpx.MockTransport | None = None,
) -> TestClient:
    container = build_test_container(
        public_pem,
        fantasy_handler=httpx.MockTransport(fantasy_handler),
        auth_handler=auth_handler,
    )
    app = create_app(settings=container.settings, container=container)
    set_container(container)
    return TestClient(app)


# ---- Happy path ---- #


def test_list_players_public_proxies_catalog_without_bearer(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/api/v1/competition/1/players"
        assert "Authorization" not in request.headers
        assert request.headers["x-lang"] == "es"
        return httpx.Response(200, json=[{"id": "1", "nickname": "Lamine", "marketValue": 50}])

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/players")

    # Assert
    assert response.status_code == 200
    assert response.json() == [{"id": "1", "nickname": "Lamine", "marketValue": 50}]


def test_get_market_value_public_proxies_history_without_bearer(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/api/v1/competition/1/player/7/market-value"
        assert "Authorization" not in request.headers
        assert request.headers["x-lang"] == "es"
        return httpx.Response(200, json=[{"date": "2026-09-01", "marketValue": 100}])

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/players/7/market-value")

    # Assert
    assert response.status_code == 200
    assert response.json() == [{"date": "2026-09-01", "marketValue": 100}]


def test_get_league_player_authenticated_proxies_with_bearer(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/api/v1/competition/1/player/7/league/42"
        assert request.headers["Authorization"] == f"Bearer {LALIGA_BEARER}"
        assert request.headers["x-lang"] == "es"
        return httpx.Response(200, json={"playerTeamId": "pt-1", "playerMaster": {"id": "7"}})

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/players/7/league/42",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 200
    assert response.json()["playerTeamId"] == "pt-1"
    assert LALIGA_BEARER not in response.text


def test_list_players_wrapped_payload_returns_rows(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"players": [{"id": "9"}]})

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/players")

    # Assert
    assert response.status_code == 200
    assert response.json() == [{"id": "9"}]


@pytest.mark.asyncio
async def test_laliga_fantasy_client_get_json_without_bearer_omits_header() -> None:
    # Arrange
    def handler(request: httpx.Request) -> httpx.Response:
        assert "Authorization" not in request.headers
        assert request.headers["x-lang"] == "es"
        return httpx.Response(200, json={"ok": True})

    client = LaligaFantasyClient(
        origin=FANTASY_ORIGIN,
        transport=httpx.MockTransport(handler),
    )

    # Act
    data = await client.get_json("/api/v1/competition/1/players")

    # Assert
    assert data == {"ok": True}


@pytest.mark.asyncio
async def test_players_repository_encodes_path_ids() -> None:
    # Arrange
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.raw_path.decode())
        return httpx.Response(200, json={})

    repo = PlayersRepository(
        LaligaFantasyClient(
            origin=FANTASY_ORIGIN,
            transport=httpx.MockTransport(handler),
        ),
        competition_id=1,
    )

    # Act
    await repo.get_market_value("a/b")
    await repo.get_league_player("tok", "p?1", "l/2")

    # Assert
    assert seen == [
        "/api/v1/competition/1/player/a%2Fb/market-value",
        "/api/v1/competition/1/player/p%3F1/league/l%2F2",
    ]


# ---- Error paths ---- #


def test_get_league_player_rejects_missing_jwt(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("Fantasy must not be called without JWT")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/players/7/league/42")

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "unauthorized"


def test_get_league_player_maps_needs_reauth(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    container = build_test_container(
        public_pem,
        fantasy_handler=httpx.MockTransport(lambda _r: httpx.Response(200, json={})),
        auth_handler=httpx.MockTransport(_auth_needs_reauth_handler),
    )
    app = create_app(settings=container.settings, container=container)
    set_container(container)

    with TestClient(app) as client:
        # Act
        response = client.get(
            "/players/7/league/42",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "needs_reauth"
    assert LALIGA_BEARER not in response.text


def test_get_league_player_maps_fantasy_unauthorized(
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
            "/players/7/league/42",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "fantasy_unauthorized"
    assert "nope" not in response.text


def test_list_players_maps_fantasy_server_error(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="upstream detail")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/players")

    # Assert
    assert response.status_code == 503
    assert response.json()["error"] == "fantasy_error"
    assert "upstream detail" not in response.text


def test_list_players_rejects_non_list_payload(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=42)

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/players")

    # Assert
    assert response.status_code == 502
    assert response.json()["error"] == "fantasy_error"


def test_get_market_value_rejects_non_json_body(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>nope</html>")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/players/7/market-value")

    # Assert
    assert response.status_code == 502
    assert response.json()["error"] == "fantasy_error"


def test_get_league_player_rejects_non_object_payload(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"playerTeamId": "pt-1"}])

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/players/7/league/42",
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
    with pytest.raises(UpstreamError, match="fantasy response was not JSON"):
        await client.get_json("/api/v1/competition/1/players")


# ---- Edge cases ---- #


def test_list_players_public_ignores_invalid_jwt(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        assert "Authorization" not in request.headers
        return httpx.Response(200, json=[{"id": "1"}])

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/players", headers={"Authorization": "Bearer invalid"})

    # Assert
    assert response.status_code == 200
    assert response.json() == [{"id": "1"}]
