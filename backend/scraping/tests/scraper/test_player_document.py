"""Tests for scrape+parse facade route."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest
from conftest import FakeSite
from fastapi.testclient import TestClient
from pydantic import SecretStr

from fantasy_scraping.config import Settings
from fantasy_scraping.main import create_app
from fantasy_scraping.models.page import PageKind, ScrapedPage, Source
from fantasy_scraping.parser.service import ParserService
from fantasy_scraping.scraper.service import ScraperService
from fantasy_scraping.services.player_document import PlayerDocumentService

FIXTURE = Path(__file__).parent.parent / "parser" / "fixtures" / "futbolfantasy"
GOLDEN = Path(__file__).parent.parent / "parser" / "golden" / "raphinha_laliga_26_27.json"
PROFILE_URL = "https://www.futbolfantasy.com/jugadores/raphinha/laliga-26-27"
TOKEN = {"X-Service-Token": "tok"}


# ---- Mocks, fixtures & helpers ---- #


@pytest.fixture
def client(service: ScraperService) -> TestClient:
    """HTTP client with players router wired."""
    return TestClient(create_app(Settings(scraping_service_token=SecretStr("tok")), service))


def _install_raphinha_fixture(site: FakeSite) -> None:
    html = (FIXTURE / "raphinha_laliga_26_27.html").read_text()
    site.overrides[PROFILE_URL] = httpx.Response(
        200, text=html, headers={"content-type": "text/html"}
    )


def _profile_page() -> ScrapedPage:
    html = (FIXTURE / "raphinha_laliga_26_27.html").read_text(encoding="utf-8")
    return ScrapedPage(
        source=Source.FUTBOLFANTASY,
        kind=PageKind.PLAYER,
        url=PROFILE_URL,
        fetched_at=datetime(2026, 10, 4, 12, 0, tzinfo=UTC),
        status_code=200,
        html=html,
        season="2026-27",
        player_slug="raphinha",
        season_slug="laliga-26-27",
    )


# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_futbolfantasy_facade_returns_core_sections() -> None:
    """Facade parse exposes meta, profile, matches, fixtures, and market."""
    scraper = AsyncMock(spec=ScraperService)
    scraper.scrape_player = AsyncMock(return_value=[_profile_page()])
    document = PlayerDocumentService(scraper, ParserService())
    player = await document.futbolfantasy("Raphinha", season="2026-27", team="FC Barcelona")
    payload = json.loads(GOLDEN.read_text())
    dumped = player.model_dump(mode="json", by_alias=True)
    assert set(dumped.keys()) >= {"meta", "profile", "matches", "fixtures", "market"}
    assert dumped["meta"]["slug"] == payload["meta"]["slug"]


def test_get_internal_players_futbolfantasy_route(
    client: TestClient, site: FakeSite, service: ScraperService
) -> None:
    """HTTP route returns 200 and JSON for a resolved player."""
    _ = service
    _install_raphinha_fixture(site)
    response = client.get(
        "/internal/players/futbolfantasy",
        params={"player_name": "Raphinha", "season": "2026-27", "team": "FC Barcelona"},
        headers=TOKEN,
    )
    assert response.status_code == 200
    assert response.json()["meta"]["slug"] == "raphinha"


# ---- Error paths ---- #


def test_get_internal_players_futbolfantasy_not_found(client: TestClient) -> None:
    """Unknown player maps to 404 player_not_found."""
    response = client.get(
        "/internal/players/futbolfantasy",
        params={"player_name": "Zzzz Qqqq", "season": "2026-27"},
        headers=TOKEN,
    )
    assert response.status_code == 404
    assert response.json()["error"] == "player_not_found"
