# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json
from collections.abc import Callable

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fantasy_api.api.deps import set_container
from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.main import create_app
from fantasy_api.repositories.buyout import BuyoutRepository
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

LEAGUE_ID = "lg-1"
PLAYER_TEAM_ID = "pt-9"


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


def _auth_needs_reauth_handler(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(401, json={"error": "needs_reauth", "detail": "pair again"})


def _assert_fantasy_auth(request: httpx.Request) -> None:
    assert request.headers.get("Authorization") == f"Bearer {LALIGA_BEARER}"
    assert request.headers.get("Accept") == "application/json"
    assert request.headers.get("x-lang") == "es"


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


def test_check_shield_proxies_upstream_with_bearer(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)
    upstream = {"isShielded": True}

    def handler(request: httpx.Request) -> httpx.Response:
        _assert_fantasy_auth(request)
        assert request.method == "GET"
        assert request.url.path.endswith(
            f"/league/{LEAGUE_ID}/player-team/{PLAYER_TEAM_ID}/check-shield",
        )
        return httpx.Response(200, json=upstream)

    with make_client(public_pem, handler) as client:
        response = client.get(
            f"/buyout/leagues/{LEAGUE_ID}/player-teams/{PLAYER_TEAM_ID}/shield",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json() == upstream


def test_pay_buyout_posts_clause_amount(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(request: httpx.Request) -> httpx.Response:
        _assert_fantasy_auth(request)
        assert request.method == "POST"
        assert request.url.path.endswith(
            f"/league/{LEAGUE_ID}/buyout/{PLAYER_TEAM_ID}/pay",
        )
        assert json.loads(request.content.decode()) == {"buyoutClauseToPay": 123_456}
        return httpx.Response(204)

    with make_client(public_pem, handler) as client:
        response = client.post(
            f"/buyout/leagues/{LEAGUE_ID}/player-teams/{PLAYER_TEAM_ID}/pay",
            headers={"Authorization": f"Bearer {token}"},
            json={"buyoutClauseToPay": 123_456},
        )

    assert response.status_code == 200
    assert response.json() == {}


def test_increase_buyout_posts_clause(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(request: httpx.Request) -> httpx.Response:
        _assert_fantasy_auth(request)
        assert request.method == "POST"
        assert request.url.path.endswith(
            f"/league/{LEAGUE_ID}/buyout/{PLAYER_TEAM_ID}/increase",
        )
        assert json.loads(request.content.decode()) == {"buyoutClause": 500_000}
        return httpx.Response(204)

    with make_client(public_pem, handler) as client:
        response = client.post(
            f"/buyout/leagues/{LEAGUE_ID}/player-teams/{PLAYER_TEAM_ID}/increase",
            headers={"Authorization": f"Bearer {token}"},
            json={"buyoutClause": 500_000},
        )

    assert response.status_code == 200
    assert response.json() == {}


def test_activate_shield_puts_body(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)
    body = {
        "playerId": PLAYER_TEAM_ID,
        "rewardedAdType": "Blindaje",
        "rewardedAd": 1,
    }

    def handler(request: httpx.Request) -> httpx.Response:
        _assert_fantasy_auth(request)
        assert request.method == "PUT"
        assert request.url.path.endswith(f"/league/{LEAGUE_ID}/shield/player")
        assert json.loads(request.content.decode()) == body
        return httpx.Response(204)

    with make_client(public_pem, handler) as client:
        response = client.put(
            f"/buyout/leagues/{LEAGUE_ID}/shield",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )

    assert response.status_code == 200
    assert response.json() == {}


# ---- Error paths ---- #


def test_check_shield_rejects_missing_bearer(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    with make_client(public_pem, handler) as client:
        response = client.get(
            f"/buyout/leagues/{LEAGUE_ID}/player-teams/{PLAYER_TEAM_ID}/shield",
        )

    assert response.status_code == 401


def test_check_shield_maps_needs_reauth(rsa_pems: tuple[str, str]) -> None:
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
            f"/buyout/leagues/{LEAGUE_ID}/player-teams/{PLAYER_TEAM_ID}/shield",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 401
    assert response.json()["error"] == "needs_reauth"


def test_check_shield_maps_fantasy_401(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401)

    with make_client(public_pem, handler) as client:
        response = client.get(
            f"/buyout/leagues/{LEAGUE_ID}/player-teams/{PLAYER_TEAM_ID}/shield",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 401
    assert LALIGA_BEARER not in response.text


def test_check_shield_rejects_non_object_payload(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=["not-an-object"])

    with make_client(public_pem, handler) as client:
        response = client.get(
            f"/buyout/leagues/{LEAGUE_ID}/player-teams/{PLAYER_TEAM_ID}/shield",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 502


def test_check_shield_rejects_non_json_body(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"<html>")

    with make_client(public_pem, handler) as client:
        response = client.get(
            f"/buyout/leagues/{LEAGUE_ID}/player-teams/{PLAYER_TEAM_ID}/shield",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 502


# ---- Edge cases ---- #


def test_pay_buyout_rejects_extra_keys(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    with make_client(public_pem, handler) as client:
        response = client.post(
            f"/buyout/leagues/{LEAGUE_ID}/player-teams/{PLAYER_TEAM_ID}/pay",
            headers={"Authorization": f"Bearer {token}"},
            json={"buyoutClauseToPay": 1, "extra": True},
        )

    assert response.status_code == 422


def test_pay_buyout_rejects_non_positive_amount(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    with make_client(public_pem, handler) as client:
        response = client.post(
            f"/buyout/leagues/{LEAGUE_ID}/player-teams/{PLAYER_TEAM_ID}/pay",
            headers={"Authorization": f"Bearer {token}"},
            json={"buyoutClauseToPay": 0},
        )

    assert response.status_code == 422


def test_increase_buyout_rejects_non_positive_clause(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    with make_client(public_pem, handler) as client:
        response = client.post(
            f"/buyout/leagues/{LEAGUE_ID}/player-teams/{PLAYER_TEAM_ID}/increase",
            headers={"Authorization": f"Bearer {token}"},
            json={"buyoutClause": -1},
        )

    assert response.status_code == 422


def test_activate_shield_rejects_extra_keys(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(_private_pem)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    with make_client(public_pem, handler) as client:
        response = client.put(
            f"/buyout/leagues/{LEAGUE_ID}/shield",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "playerId": PLAYER_TEAM_ID,
                "rewardedAdType": "Blindaje",
                "rewardedAd": 1,
                "extra": True,
            },
        )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_buyout_repository_encodes_path_segments() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.raw_path.decode())
        return httpx.Response(200, json={"isShielded": False})

    repo = BuyoutRepository(
        LaligaFantasyClient(
            origin=FANTASY_ORIGIN,
            transport=httpx.MockTransport(handler),
        ),
        competition_id=1,
    )

    await repo.check_shield("tok", "l/e", "p/t")
    await repo.pay_buyout("tok", "l/e", "p/t", {"buyoutClauseToPay": 1})

    assert seen == [
        "/api/v1/competition/1/league/l%2Fe/player-team/p%2Ft/check-shield",
        "/api/v1/competition/1/league/l%2Fe/buyout/p%2Ft/pay",
    ]
