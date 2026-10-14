"""Official classification parser, private route, cache and crawl safeguards."""

import asyncio
import json
from copy import deepcopy
from datetime import UTC, datetime

import httpx
import pytest
from fastapi.testclient import TestClient

from fantasy_scraping.config import Settings
from fantasy_scraping.main import create_app
from fantasy_scraping.scraper.errors import HostNotAllowedError, UnexpectedContentError
from fantasy_scraping.scraper.http_client import ScrapingHttpClient
from fantasy_scraping.scraper.settings import ScraperSettings
from fantasy_scraping.services.standings import (
    ROBOTS_URL,
    STANDINGS_URL,
    OfficialStandingsScraper,
    allowed_standings_url,
    parse_official_standings,
)

# ---- Mocks, fixtures & helpers ---- #

NOW = datetime(2026, 10, 14, tzinfo=UTC)


def page_data():
    """Create twenty synthetic overall rows, separate from an invalid home-only table."""
    rows = [
        {
            "team": {"id": i, "nickname": f"Club {i}"},
            "position": i,
            "points": 0,
            "played": 0,
            "won": 0,
            "drawn": 0,
            "lost": 0,
            "goals_for": 0,
            "goals_against": 0,
            "goal_difference": "+0",
        }
        for i in range(1, 21)
    ]
    return {
        "props": {
            "pageProps": {
                "season": "2026",
                "competition": "primera-division",
                "standings": rows,
                "standingsHome": [],
            }
        }
    }


def html(data):
    """Embed the supported server-rendered JSON script."""
    return '<script id="__NEXT_DATA__" type="application/json">' + json.dumps(data) + "</script>"


class Clock:
    """Advance fake time instantly when polite crawling needs to wait."""

    def __init__(self):
        self.now = 0.0

    def monotonic(self):
        return self.now

    async def sleep(self, seconds):
        self.now += seconds


# ---- Happy path ---- #


def test_parse_official_standings_overall_table_returns_twenty_rows():
    result = parse_official_standings(html(page_data()), NOW)
    assert result.season == 2026
    assert len(result.rows) == 20
    assert result.fetched_at == NOW
    assert result.rows[0].goal_difference == 0


@pytest.mark.asyncio
async def test_get_standings_concurrent_reads_caches_and_respects_crawl_delay():
    clock = Clock()
    calls = []

    def site(request):
        calls.append((str(request.url), clock.now))
        if str(request.url) == ROBOTS_URL:
            return httpx.Response(
                200, text="User-agent: *\nAllow: /\nDisallow: /en-*/*\nCrawl-delay: 30\n"
            )
        assert str(request.url) == STANDINGS_URL
        return httpx.Response(200, text=html(page_data()), headers={"content-type": "text/html"})

    client = ScrapingHttpClient(
        ScraperSettings(_env_file=None, contact="https://example.test", jitter_ms=(0, 0)),
        transport=httpx.MockTransport(site),
        clock=clock,
        url_guard=allowed_standings_url,
        robots_url=ROBOTS_URL,
    )
    scraper = OfficialStandingsScraper(client)
    try:
        first, second = await asyncio.gather(scraper.get_standings(), scraper.get_standings())
        assert first is second
        assert len(calls) == 2
        assert calls[1][1] - calls[0][1] >= 30
        with TestClient(
            create_app(
                Settings(_env_file=None, debug=False, scraping_service_token="private"),
                standings_service=scraper,
            )
        ) as app:
            assert app.get("/internal/scrape/standings").status_code == 401
            assert (
                app.get(
                    "/internal/scrape/standings", headers={"X-Service-Token": "wrong"}
                ).status_code
                == 401
            )
            response = app.get("/internal/scrape/standings", headers={"X-Service-Token": "private"})
            assert response.status_code == 200
            assert len(response.json()["rows"]) == 20
            assert "__NEXT_DATA__" not in response.text
    finally:
        await client.aclose()


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "case",
    [
        "competition",
        "season",
        "duplicate",
        "positions",
        "totals",
        "goals",
        "partial",
        "missing",
        "bad_json",
        "two_scripts",
    ],
)
def test_parse_official_standings_invalid_page_rejects_data(case):
    data = deepcopy(page_data())
    props = data["props"]["pageProps"]
    if case == "competition":
        props["competition"] = "segunda-division"
    elif case == "season":
        props["season"] = 2026
    elif case == "duplicate":
        props["standings"][1]["team"]["id"] = 1
    elif case == "positions":
        props["standings"][1]["position"] = 1
    elif case == "totals":
        props["standings"][0]["played"] = 1
    elif case == "goals":
        props["standings"][0]["goal_difference"] = "+1"
    elif case == "partial":
        props["standings"].pop()
    elif case == "missing":
        del props["standings"]
    content = html(data)
    if case == "bad_json":
        content = '<script id="__NEXT_DATA__">{bad</script>'
    elif case == "two_scripts":
        content += content
    with pytest.raises(UnexpectedContentError, match="official standings returned invalid data"):
        parse_official_standings(content, NOW)


@pytest.mark.parametrize(
    "url",
    [
        "https://www.laliga.com/en-US/laliga-easports/standing",
        "https://evil.test/laliga-easports/clasificacion",
        "http://www.laliga.com/laliga-easports/clasificacion",
        "https://www.laliga.com:443/laliga-easports/clasificacion",
        STANDINGS_URL + "?redirect=evil",
        STANDINGS_URL + "#fragment",
    ],
)
def test_allowed_standings_url_outside_fixed_paths_rejects_url(url):
    with pytest.raises(HostNotAllowedError):
        allowed_standings_url(url)


# ---- Edge cases ---- #


def test_parse_official_standings_negative_goal_difference_preserves_signed_value():
    data = page_data()
    data["props"]["pageProps"]["standings"][0].update(goals_against=2, goal_difference="-2")
    assert parse_official_standings(html(data), NOW).rows[0].goal_difference == -2
