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
from fantasy_api.main import create_app
from fantasy_api.repositories.calendar import CalendarRepository
from fantasy_api.repositories.leagues import LeaguesRepository
from fantasy_api.repositories.market import MarketRepository
from fantasy_api.repositories.players import PlayersRepository
from fantasy_api.repositories.teams import TeamsRepository
from fantasy_api.security.internal_jwt import StaticInternalJwtValidator
from fantasy_api.services.calendar import CalendarService
from fantasy_api.services.leagues import LeaguesService
from fantasy_api.services.market import MarketService
from fantasy_api.services.players import PlayersService
from fantasy_api.services.teams import TeamsService
from fastapi.testclient import TestClient

ISSUER = "https://auth.fantasy-builder.local"
AUDIENCE = "fantasy-api"
SERVICE_TOKEN = "api-service-token"
FANTASY_ORIGIN = "https://fantasy.test"
LALIGA_BEARER = "laliga-secret-token"
LEAGUE_ID = "lg-1"


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


def mint_internal_jwt(private_pem: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": "app-user-1",
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


def _auth_ok_handler(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "bearer_token": LALIGA_BEARER,
            "expires_at": int(time.time()) + 100,
            "token_type": "Bearer",
        },
    )


def _auth_needs_reauth_handler(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(401, json={"error": "needs_reauth", "detail": "pair again"})


def _assert_fantasy_auth(request: httpx.Request) -> None:
    assert request.headers.get("Authorization") == f"Bearer {LALIGA_BEARER}"
    assert request.headers.get("Accept") == "application/json"
    assert request.headers.get("x-lang") == "es"


def build_market_container(
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
    cid = settings.laliga_competition_id
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
            LeaguesRepository(laliga_client, competition_id=cid),
        ),
        teams_service=TeamsService(
            credentials,
            TeamsRepository(laliga_client, competition_id=cid),
        ),
        calendar_service=CalendarService(
            CalendarRepository(laliga_client, competition_id=cid),
        ),
        players_service=PlayersService(
            credentials,
            PlayersRepository(laliga_client, competition_id=cid),
        ),
        market_service=MarketService(
            credentials,
            MarketRepository(laliga_client, competition_id=cid),
        ),
    )


def make_client(
    public_pem: str,
    fantasy_handler: Callable[[httpx.Request], httpx.Response],
    *,
    auth_handler: httpx.MockTransport | None = None,
) -> TestClient:
    container = build_market_container(
        public_pem,
        fantasy_handler=httpx.MockTransport(fantasy_handler),
        auth_handler=auth_handler,
    )
    app = create_app(settings=container.settings, container=container)
    set_container(container)
    return TestClient(app)


# ---- Happy path ---- #


def test_get_market_proxies_upstream_with_bearer(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)
    upstream = {"marketPlayers": [], "userBids": []}

    def handler(request: httpx.Request) -> httpx.Response:
        _assert_fantasy_auth(request)
        assert request.method == "GET"
        assert request.url.path == f"/api/v1/competition/1/league/{LEAGUE_ID}/market"
        return httpx.Response(200, json=upstream)

    with make_client(public_pem, handler) as client:
        response = client.get(
            f"/market/leagues/{LEAGUE_ID}",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json() == upstream
    assert LALIGA_BEARER not in response.text


def test_get_market_history_returns_list(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)
    upstream = [{"id": "h1"}, {"id": "h2"}]

    def handler(request: httpx.Request) -> httpx.Response:
        _assert_fantasy_auth(request)
        assert request.url.path.endswith("/market/history")
        return httpx.Response(200, json=upstream)

    with make_client(public_pem, handler) as client:
        response = client.get(
            f"/market/leagues/{LEAGUE_ID}/history",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json() == upstream


def test_get_player_team_offers_proxies_path(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)
    upstream = {"offers": [{"id": "o1"}]}

    def handler(request: httpx.Request) -> httpx.Response:
        _assert_fantasy_auth(request)
        assert request.url.path.endswith("/league/lg-1/playerTeam/pt-9/offer")
        return httpx.Response(200, json=upstream)

    with make_client(public_pem, handler) as client:
        response = client.get(
            f"/market/leagues/{LEAGUE_ID}/player-teams/pt-9/offers",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json()["offers"][0]["id"] == "o1"


def test_create_bid_posts_money(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(request: httpx.Request) -> httpx.Response:
        _assert_fantasy_auth(request)
        assert request.method == "POST"
        assert request.url.path.endswith("/market/mk-1/bid")
        assert json.loads(request.content.decode()) == {"money": 500_000}
        return httpx.Response(204)

    with make_client(public_pem, handler) as client:
        response = client.post(
            f"/market/leagues/{LEAGUE_ID}/mk-1/bids",
            headers={"Authorization": f"Bearer {token}"},
            json={"money": 500_000},
        )

    assert response.status_code == 200
    assert response.json() == {}


def test_create_listing_forwards_player_team_id(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(request: httpx.Request) -> httpx.Response:
        _assert_fantasy_auth(request)
        assert request.url.path.endswith("/market/sell")
        body = json.loads(request.content.decode())
        assert body == {"playerId": "pt-9", "salePrice": 1_000_000}
        return httpx.Response(200, json={"marketId": "m-new"})

    with make_client(public_pem, handler) as client:
        response = client.post(
            f"/market/leagues/{LEAGUE_ID}/listings",
            headers={"Authorization": f"Bearer {token}"},
            json={"playerId": "pt-9", "salePrice": 1_000_000},
        )

    assert response.status_code == 200
    assert response.json() == {"marketId": "m-new"}


@pytest.mark.parametrize(
    (
        "api_path",
        "method",
        "upstream_suffix",
        "upstream_method",
        "upstream_body",
        "kwargs",
    ),
    [
        (
            f"/market/leagues/{LEAGUE_ID}/mk-1/bids/bd-1",
            "put",
            "/market/mk-1/bid/bd-1",
            "PUT",
            {"money": 100},
            {"json": {"money": 100}},
        ),
        (
            f"/market/leagues/{LEAGUE_ID}/mk-1/offers/of-1/accept",
            "post",
            "/offer/of-1/accept",
            "POST",
            {"offerMoney": 200},
            {"json": {"offerMoney": 200}},
        ),
        (
            f"/market/leagues/{LEAGUE_ID}/mk-1/offers/of-1/reject",
            "post",
            "/offer/of-1/reject",
            "POST",
            None,
            {},
        ),
        (
            f"/market/leagues/{LEAGUE_ID}/mk-1",
            "delete",
            "/market/mk-1/delete",
            "DELETE",
            None,
            {},
        ),
        (
            f"/market/leagues/{LEAGUE_ID}/direct-offers",
            "post",
            "/market/direct-offer",
            "POST",
            {"playerId": "pt-1", "money": 300},
            {"json": {"playerId": "pt-1", "money": 300}},
        ),
        (
            f"/market/leagues/{LEAGUE_ID}/mk-1/offers/of-1",
            "delete",
            "/offer/of-1/cancel",
            "DELETE",
            None,
            {},
        ),
    ],
)
def test_market_mutations_proxy_upstream_paths(
    rsa_pems: tuple[str, str],
    api_path: str,
    method: str,
    upstream_suffix: str,
    upstream_method: str,
    upstream_body: dict[str, object] | None,
    kwargs: dict[str, object],
) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(request: httpx.Request) -> httpx.Response:
        _assert_fantasy_auth(request)
        assert request.method == upstream_method
        assert upstream_suffix in request.url.raw_path.decode()
        if upstream_body is None:
            assert not request.content
        else:
            assert json.loads(request.content.decode()) == upstream_body
        return httpx.Response(204)

    with make_client(public_pem, handler) as client:
        response = getattr(client, method)(
            api_path,
            headers={"Authorization": f"Bearer {token}"},
            **kwargs,
        )

    assert response.status_code == 200
    assert response.json() == {}


def test_cancel_bid_delete_proxies_cancel_suffix(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(request: httpx.Request) -> httpx.Response:
        _assert_fantasy_auth(request)
        assert request.method == "DELETE"
        assert request.url.path.endswith("/market/mk-1/bid/bd-1/cancel")
        return httpx.Response(204)

    with make_client(public_pem, handler) as client:
        response = client.delete(
            f"/market/leagues/{LEAGUE_ID}/mk-1/bids/bd-1",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json() == {}


# ---- Error paths ---- #


def test_get_market_rejects_missing_bearer(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    with make_client(public_pem, handler) as client:
        response = client.get(f"/market/leagues/{LEAGUE_ID}")

    assert response.status_code == 401


def test_get_market_maps_needs_reauth(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    with make_client(
        public_pem,
        fantasy_handler,
        auth_handler=httpx.MockTransport(_auth_needs_reauth_handler),
    ) as client:
        response = client.get(
            f"/market/leagues/{LEAGUE_ID}",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 401
    assert response.json()["error"] == "needs_reauth"


def test_get_market_maps_fantasy_401(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401)

    with make_client(public_pem, handler) as client:
        response = client.get(
            f"/market/leagues/{LEAGUE_ID}",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 401
    assert LALIGA_BEARER not in response.text


def test_get_market_rejects_non_object_payload(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"marketPlayers": []}])

    with make_client(public_pem, handler) as client:
        response = client.get(
            f"/market/leagues/{LEAGUE_ID}",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 502


def test_get_market_history_accepts_wrapped_data_list(
    rsa_pems: tuple[str, str],
) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)
    upstream = {"data": [{"id": "h1"}, {"id": "h2"}]}

    def handler(request: httpx.Request) -> httpx.Response:
        _assert_fantasy_auth(request)
        assert request.url.path.endswith("/market/history")
        return httpx.Response(200, json=upstream)

    with make_client(public_pem, handler) as client:
        response = client.get(
            f"/market/leagues/{LEAGUE_ID}/history",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json() == [{"id": "h1"}, {"id": "h2"}]


def test_get_market_history_rejects_invalid_row_shape(
    rsa_pems: tuple[str, str],
) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"id": {"bad": True}}])

    with make_client(public_pem, handler) as client:
        response = client.get(
            f"/market/leagues/{LEAGUE_ID}/history",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 502


def test_get_market_history_rejects_non_list_payload(
    rsa_pems: tuple[str, str],
) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json="not-a-collection")

    with make_client(public_pem, handler) as client:
        response = client.get(
            f"/market/leagues/{LEAGUE_ID}/history",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 502


def test_get_market_rejects_non_json_body(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"<html>")

    with make_client(public_pem, handler) as client:
        response = client.get(
            f"/market/leagues/{LEAGUE_ID}",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 502


def test_create_bid_rejects_extra_keys(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    with make_client(public_pem, handler) as client:
        response = client.post(
            f"/market/leagues/{LEAGUE_ID}/mk-1/bids",
            headers={"Authorization": f"Bearer {token}"},
            json={"money": 1, "extra": True},
        )

    assert response.status_code == 422


def test_create_bid_rejects_non_positive_money(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    with make_client(public_pem, handler) as client:
        response = client.post(
            f"/market/leagues/{LEAGUE_ID}/mk-1/bids",
            headers={"Authorization": f"Bearer {token}"},
            json={"money": 0},
        )

    assert response.status_code == 422


# ---- Edge cases ---- #


@pytest.mark.asyncio
async def test_market_repository_encodes_league_path_segments() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.raw_path.decode())
        return httpx.Response(200, json={})

    repo = MarketRepository(
        LaligaFantasyClient(
            origin=FANTASY_ORIGIN,
            transport=httpx.MockTransport(handler),
        ),
        competition_id=1,
    )

    await repo.get_market("tok", "l/e")
    await repo.get_player_team_offers("tok", "l/e", "p/t")

    assert seen == [
        "/api/v1/competition/1/league/l%2Fe/market",
        "/api/v1/competition/1/league/l%2Fe/playerTeam/p%2Ft/offer",
    ]
