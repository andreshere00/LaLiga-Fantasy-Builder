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
from test_container import build_test_container
from test_container import test_settings as base_test_settings

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


def _catalog_player() -> list[dict[str, object]]:
    return [
        {
            "id": "4288",
            "nickname": "Raphinha",
            "teamId": 4,
            "team": {"name": "FC Barcelona"},
        }
    ]


def _market_history() -> list[dict[str, object]]:
    return [
        {"date": "2026-09-28", "marketValue": 100},
        {"date": "2026-10-03", "marketValue": 120},
    ]


def make_client(
    public_pem: str,
    *,
    settings: object | None = None,
    scraping_handler: httpx.MockTransport | None = None,
    fantasy_handler: httpx.MockTransport | None = None,
    weather_handler: httpx.MockTransport | None = None,
) -> TestClient:
    scrape_calls: list[str] = []
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    resolved_settings = settings or base_test_settings().model_copy(
        update={
            "scraping_base_url": "http://scraping.test",
            "scraping_service_token": SecretStr("scraping-token"),
            "openweather_api_key": SecretStr("weather-key"),
        }
    )

    def default_fantasy(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/players"):
            return httpx.Response(200, json=_catalog_player())
        if request.url.path.endswith("/market-value"):
            return httpx.Response(200, json=_market_history())
        return httpx.Response(404)

    def default_scraping(request: httpx.Request) -> httpx.Response:
        scrape_calls.append(request.url.path)
        assert request.headers.get("X-Service-Token") == "scraping-token"
        return httpx.Response(200, json=golden)

    def default_weather(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"list": []})

    container = build_test_container(
        public_pem,
        fantasy_handler=fantasy_handler or httpx.MockTransport(default_fantasy),
        scraping_transport=scraping_handler or httpx.MockTransport(default_scraping),
        weather_transport=weather_handler or httpx.MockTransport(default_weather),
        settings=resolved_settings,
    )
    app = create_app(settings=resolved_settings, container=container)
    set_container(container)
    client = TestClient(app)
    client.scrape_calls = scrape_calls  # type: ignore[attr-defined]
    return client


def detail_url() -> str:
    return "/players/4288/stats/detail"


# ---- Happy path ---- #


def test_detail_all_segments_succeed_single_scrape(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    with make_client(public_pem) as client:
        response = client.get(
            detail_url(),
            headers={"Authorization": f"Bearer {token}"},
        )
        calls = client.scrape_calls  # type: ignore[attr-defined]
    assert response.status_code == 200
    body = response.json()
    assert body["player_id"] == "4288"
    assert body["fixtures"] is not None
    assert body["market"] is not None
    assert body["recent"] is not None
    assert body["upcoming"] is not None
    assert body["profile"] is not None
    assert body["segment_errors"] == []
    assert len(calls) == 1
    assert "scraping-token" not in response.text
    assert "Bearer" not in response.text


def test_detail_include_market_only_skips_scrape(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    market_calls = 0

    def fantasy(request: httpx.Request) -> httpx.Response:
        nonlocal market_calls
        if request.url.path.endswith("/players"):
            return httpx.Response(200, json=_catalog_player())
        if request.url.path.endswith("/market-value"):
            market_calls += 1
            return httpx.Response(200, json=_market_history())
        return httpx.Response(404)

    with make_client(public_pem, fantasy_handler=httpx.MockTransport(fantasy)) as client:
        response = client.get(
            detail_url(),
            headers={"Authorization": f"Bearer {token}"},
            params={"include": "market"},
        )
        calls = client.scrape_calls  # type: ignore[attr-defined]
    assert response.status_code == 200
    body = response.json()
    assert body["market"] is not None
    assert body["fixtures"] is None
    assert body["segment_errors"] == []
    assert len(calls) == 0
    assert market_calls == 1


# ---- Error paths ---- #


def test_detail_missing_jwt_returns_401(rsa_pems: tuple[str, str]) -> None:
    _private_pem, public_pem = rsa_pems
    with make_client(public_pem) as client:
        response = client.get(detail_url())
    assert response.status_code == 401


def test_detail_unknown_player_returns_404_without_scrape(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"id": "1", "nickname": "Other"}])

    settings = base_test_settings().model_copy(
        update={
            "scraping_base_url": "http://scraping.test",
            "scraping_service_token": SecretStr("scraping-token"),
        }
    )
    with make_client(
        public_pem,
        settings=settings,
        fantasy_handler=httpx.MockTransport(fantasy),
        scraping_handler=httpx.MockTransport(lambda _r: httpx.Response(200, json={})),
    ) as client:
        response = client.get(
            detail_url(),
            headers={"Authorization": f"Bearer {token}"},
        )
        calls = client.scrape_calls  # type: ignore[attr-defined]
    assert response.status_code == 404
    assert response.json()["error"] == "not_found"
    assert len(calls) == 0


def test_detail_scraper_503_market_still_ok(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def scraping(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "upstream down", "token": "secret"})

    with make_client(
        public_pem,
        scraping_handler=httpx.MockTransport(scraping),
    ) as client:
        response = client.get(
            detail_url(),
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["market"] is not None
    assert body["fixtures"] is None
    assert body["profile"] is None
    scraped_errors = [e for e in body["segment_errors"] if e["segment"] != "upcoming"]
    assert len(scraped_errors) >= 3
    assert all(e["code"] == "scraping_unavailable" for e in scraped_errors[:3])
    assert all(e["detail"] == "scraping unavailable" for e in scraped_errors[:3])
    assert "secret" not in response.text


def test_detail_scraper_player_404_market_ok(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def scraping(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    with make_client(
        public_pem,
        scraping_handler=httpx.MockTransport(scraping),
    ) as client:
        response = client.get(
            detail_url(),
            headers={"Authorization": f"Bearer {token}"},
            params={"include_weather": "false"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["market"] is not None
    scraped = [
        e for e in body["segment_errors"] if e["segment"] in {"fixtures", "recent", "profile"}
    ]
    assert len(scraped) == 3
    assert all(e["code"] == "stats_source_not_found" for e in scraped)
    assert all(e["detail"] == "stats source not found" for e in scraped)


def test_detail_preset_with_from_returns_422(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    fantasy_calls = 0

    def fantasy(request: httpx.Request) -> httpx.Response:
        nonlocal fantasy_calls
        fantasy_calls += 1
        return httpx.Response(200, json=_catalog_player())

    with make_client(public_pem, fantasy_handler=httpx.MockTransport(fantasy)) as client:
        response = client.get(
            detail_url(),
            headers={"Authorization": f"Bearer {token}"},
            params={"preset": "season", "from": "2026-09-01"},
        )
    assert response.status_code == 422
    assert fantasy_calls == 0


def test_detail_rate_limit_returns_429(rsa_pems: tuple[str, str]) -> None:
    import fantasy_api.security.rate_limit as rate_limit

    rate_limit._limiters.clear()
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    settings = base_test_settings().model_copy(
        update={
            "scraping_base_url": "http://scraping.test",
            "scraping_service_token": SecretStr("scraping-token"),
            "openweather_api_key": SecretStr("weather-key"),
            "player_stats_rate_limit_per_minute": 1,
        }
    )
    with make_client(public_pem, settings=settings) as client:
        headers = {"Authorization": f"Bearer {token}"}
        first = client.get(detail_url(), headers=headers)
        second = client.get(detail_url(), headers=headers)
    rate_limit._limiters.clear()
    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"] == "rate_limited"


# ---- Edge cases ---- #


def test_detail_missing_weather_key_still_returns_upcoming(
    rsa_pems: tuple[str, str],
) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    settings = base_test_settings().model_copy(
        update={
            "scraping_base_url": "http://scraping.test",
            "scraping_service_token": SecretStr("scraping-token"),
            "openweather_api_key": SecretStr(""),
        }
    )
    with make_client(public_pem, settings=settings) as client:
        response = client.get(
            detail_url(),
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["upcoming"] is not None
    assert body["upcoming"]["matches"]
    assert all(match["weather"]["reason"] == "disabled" for match in body["upcoming"]["matches"])
    assert all(item["segment"] != "upcoming" for item in body["segment_errors"])


def test_detail_scraper_url_unset_disables_scraped_segments(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    settings = base_test_settings().model_copy(
        update={
            "scraping_base_url": "",
            "scraping_service_token": SecretStr("scraping-token"),
        }
    )
    with make_client(public_pem, settings=settings) as client:
        response = client.get(
            detail_url(),
            headers={"Authorization": f"Bearer {token}"},
            params={"include_weather": "false"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["market"] is not None
    disabled = [e for e in body["segment_errors"] if e["code"] == "disabled"]
    assert {e["segment"] for e in disabled} == {
        "fixtures",
        "recent",
        "upcoming",
        "profile",
    }
