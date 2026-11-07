# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from pathlib import Path

import httpx
from conftest import FakeSite
from fastapi.testclient import TestClient
from pydantic import SecretStr

from fantasy_scraping.config import Settings
from fantasy_scraping.main import create_app
from fantasy_scraping.scraper.service import ScraperService
from fantasy_scraping.scraper.urls import assert_allowed_url, club_news_url

FIXTURES = Path(__file__).parent.parent / "parser" / "fixtures" / "futbolfantasy" / "clubs"
TOKEN = {"X-Service-Token": "tok"}
CLUB_URL = "https://www.futbolfantasy.com/laliga/equipos/villarreal"
NEWS_URL = "https://www.futbolfantasy.com/laliga/equipos/villarreal/ultimos-cambios"


def _html_response(name: str) -> httpx.Response:
    return httpx.Response(
        200,
        text=(FIXTURES / name).read_text(encoding="utf-8"),
        headers={"content-type": "text/html"},
    )


def _client(service: ScraperService) -> TestClient:
    settings = Settings(scraping_service_token=SecretStr("tok"))
    return TestClient(create_app(settings, service))


# ---- Happy path ---- #


def test_club_news_url_is_allowed() -> None:
    url = club_news_url("rayo-vallecano")
    assert url.endswith("/laliga/equipos/rayo-vallecano/ultimos-cambios")
    assert assert_allowed_url(url) == url


def test_get_internal_club_returns_parsed_page(site: FakeSite, service: ScraperService) -> None:
    site.overrides[CLUB_URL] = _html_response("villarreal.html")
    response = _client(service).get("/internal/clubs/villarreal", headers=TOKEN)
    assert response.status_code == 200
    body = response.json()
    assert body["slug"] == "villarreal"
    assert body["matchday"] == 12
    assert body["coach"]["name"] == "Íñigo Pérez"
    assert len(body["starters"]) == 11


def test_get_internal_club_news_returns_five_items(site: FakeSite, service: ScraperService) -> None:
    site.overrides[NEWS_URL] = _html_response("villarreal-ultimos-cambios.html")
    response = _client(service).get("/internal/clubs/villarreal/news", headers=TOKEN)
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 5
    assert items[2]["title"] == "Foyth pasa de duda a baja"


# ---- Error paths ---- #


def test_get_internal_club_missing_token_returns_401(service: ScraperService) -> None:
    response = _client(service).get("/internal/clubs/villarreal")
    assert response.status_code == 401


def test_get_internal_club_invalid_slug_returns_422(service: ScraperService) -> None:
    response = _client(service).get("/internal/clubs/Villa_Real", headers=TOKEN)
    assert response.status_code == 422
    assert response.json()["error"] == "invalid_request"


# ---- Edge cases ---- #
