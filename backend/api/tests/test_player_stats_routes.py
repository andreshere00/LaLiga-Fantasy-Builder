# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fantasy_api.api.deps import set_container
from fantasy_api.main import create_app
from fastapi.testclient import TestClient
from jwt_mint import mint_internal_jwt
from pydantic import SecretStr
from test_container import build_test_container, test_settings

GOLDEN = Path(__file__).parent / "fixtures" / "scraping" / "futbolfantasy_raphinha.json"


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


def make_client(public_pem: str) -> TestClient:
    scrape_calls: list[str] = []
    scrape_params: list[dict[str, str]] = []
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    settings = test_settings().model_copy(
        update={
            "scraping_base_url": "http://scraping.test",
            "scraping_service_token": SecretStr("scraping-token"),
        }
    )

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/players"):
            return httpx.Response(
                200,
                json=[
                    {
                        "id": "4288",
                        "nickname": "Raphinha",
                        "teamId": 4,
                        "team": {"name": "FC Barcelona"},
                    }
                ],
            )
        if request.url.path.endswith("/market-value"):
            return httpx.Response(
                200,
                json=[
                    {"date": "2026-09-28", "marketValue": 100},
                    {"date": "2026-10-03", "marketValue": 120},
                ],
            )
        return httpx.Response(404)

    def scraping_handler(request: httpx.Request) -> httpx.Response:
        scrape_calls.append(request.url.path)
        scrape_params.append(dict(request.url.params))
        assert request.headers.get("X-Service-Token") == "scraping-token"
        return httpx.Response(200, json=golden)

    container = build_test_container(
        public_pem,
        fantasy_handler=httpx.MockTransport(fantasy_handler),
        scraping_transport=httpx.MockTransport(scraping_handler),
        settings=settings,
    )
    app = create_app(settings=settings, container=container)
    set_container(container)
    client = TestClient(app)
    client.scrape_calls = scrape_calls  # type: ignore[attr-defined]
    client.scrape_params = scrape_params  # type: ignore[attr-defined]
    return client


# ---- Happy path ---- #


def test_stats_index_requires_jwt_and_lists_segments(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    with make_client(public_pem) as client:
        missing = client.get("/players/4288/stats")
        assert missing.status_code == 401
        response = client.get(
            "/players/4288/stats",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["player"]["id"] == "4288"
    assert len(body["segments"]) == 5


def test_stats_market_requires_jwt(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    with make_client(public_pem) as client:
        response = client.get(
            "/players/4288/stats/market",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    assert response.json()["window"]["end_value"] == 120


def test_stats_profile_uses_single_scrape(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    with make_client(public_pem) as client:
        first = client.get(
            "/players/4288/stats/profile",
            headers={"Authorization": f"Bearer {token}"},
        )
        second = client.get(
            "/players/4288/stats/matches/recent",
            headers={"Authorization": f"Bearer {token}"},
        )
        calls = client.scrape_calls  # type: ignore[attr-defined]
    assert first.status_code == 200
    assert second.status_code == 200
    assert len(calls) == 1


def test_scraping_request_uses_season_key(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    with make_client(public_pem) as client:
        response = client.get(
            "/players/4288/stats/profile",
            headers={"Authorization": f"Bearer {token}"},
        )
        params = client.scrape_params  # type: ignore[attr-defined]
    assert response.status_code == 200
    assert params[0]["season"] == "2026-27"


def test_stats_fixtures_returns_rows(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    with make_client(public_pem) as client:
        response = client.get(
            "/players/4288/stats/fixtures",
            headers={"Authorization": f"Bearer {token}"},
            params={"last": 2, "competition": "laliga"},
        )
    assert response.status_code == 200
    body = response.json()
    assert len(body["fixtures"]) <= 2
    assert body["fixtures"][0]["fixture"]["competition"] == "laliga"


def test_stats_recent_honours_include_stats_flag(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    with make_client(public_pem) as client:
        with_stats = client.get(
            "/players/4288/stats/matches/recent",
            headers={"Authorization": f"Bearer {token}"},
        )
        without_stats = client.get(
            "/players/4288/stats/matches/recent",
            headers={"Authorization": f"Bearer {token}"},
            params={"include_stats": "false"},
        )
    assert with_stats.status_code == 200
    assert without_stats.status_code == 200
    assert with_stats.json()["matches"][0]["stats"] is not None
    assert without_stats.json()["matches"][0]["stats"] is None


def test_stats_upcoming_returns_travel_block(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    with make_client(public_pem) as client:
        response = client.get(
            "/players/4288/stats/matches/upcoming",
            headers={"Authorization": f"Bearer {token}"},
            params={"include_weather": "false", "limit": 1},
        )
    assert response.status_code == 200
    match = response.json()["matches"][0]
    assert match["travel"]["from_venue"]["city"] == "Barcelona"


def test_stats_rate_limit_returns_429(rsa_pems: tuple[str, str]) -> None:
    import fantasy_api.security.rate_limit as rate_limit

    rate_limit._limiters.clear()
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    settings = test_settings().model_copy(
        update={
            "scraping_base_url": "http://scraping.test",
            "scraping_service_token": SecretStr("scraping-token"),
            "player_stats_rate_limit_per_minute": 1,
        }
    )
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/players"):
            return httpx.Response(
                200,
                json=[{"id": "4288", "nickname": "Raphinha", "teamId": 4}],
            )
        return httpx.Response(404)

    def scraping_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=golden)

    container = build_test_container(
        public_pem,
        fantasy_handler=httpx.MockTransport(fantasy_handler),
        scraping_transport=httpx.MockTransport(scraping_handler),
        settings=settings,
    )
    app = create_app(settings=settings, container=container)
    set_container(container)
    headers = {"Authorization": f"Bearer {token}"}
    with TestClient(app) as client:
        first = client.get("/players/4288/stats/fixtures", headers=headers)
        second = client.get("/players/4288/stats/fixtures", headers=headers)
    rate_limit._limiters.clear()
    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"] == "rate_limited"


def test_unknown_player_returns_not_found(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"id": "1", "nickname": "Other"}])

    settings = test_settings().model_copy(
        update={
            "scraping_base_url": "http://scraping.test",
            "scraping_service_token": SecretStr("scraping-token"),
        }
    )
    container = build_test_container(
        public_pem,
        fantasy_handler=httpx.MockTransport(fantasy_handler),
        scraping_transport=httpx.MockTransport(lambda r: httpx.Response(200, json={})),
        settings=settings,
    )
    app = create_app(settings=settings, container=container)
    set_container(container)
    with TestClient(app) as client:
        response = client.get(
            "/players/4288/stats",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 404
    assert response.json()["error"] == "not_found"
