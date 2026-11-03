"""Safe literals, source contracts, robots and the opt-in private route."""

# ---- Mocks, fixtures & helpers ---- #

import asyncio
from datetime import UTC, datetime

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from fantasy_scraping.config import Settings
from fantasy_scraping.main import create_app
from fantasy_scraping.providers.datamb.parser import parse_player
from fantasy_scraping.providers.datamb.service import ORIGIN, DataMBScraper, allowed_url
from fantasy_scraping.scraper.errors import (
    HostNotAllowedError,
    RobotsDisallowedError,
    UnexpectedContentError,
    UpstreamUnavailableError,
)
from fantasy_scraping.scraper.http_client import ScrapingHttpClient
from fantasy_scraping.scraper.settings import ScraperSettings

NOW = datetime(2026, 10, 30, tzinfo=UTC)
LABELS = [
    "Duels won %",
    "Possessions won",
    "Progressive carries",
    "Forward passes completed",
    "Forward pass completion %",
    "Key passes",
    "Progressive passes completed",
]


def player_html() -> str:
    """Synthetic source format: literal player row and exact fifteen-column header."""
    labels = ["", "", "Club", "League", "Age", "Position", "Season", *LABELS, "Minutes played"]
    return (
        "<html><script>const csvData = `1,Pedri,Barcelona,La Liga,23,Midfielder,2026/27,0.44,0.56,0.64,0.88,0.59,0.85,0.97,769`;let headers = ["
        + ",".join(repr(x) for x in labels)
        + "];</script></html>"
    )


class Clock:
    """Advance virtual time instead of sleeping for throttling or backoff."""

    def __init__(self):
        self.now = 0.0

    def monotonic(self):
        return self.now

    async def sleep(self, seconds):
        self.now += seconds


# ---- Happy path ---- #


def test_parse_player_static_html_preserves_labels_scale_and_context():
    record = parse_player(player_html(), "2026-27", NOW)
    assert record.name == "Pedri"
    assert record.minutes == 769
    assert record.metric_labels == LABELS
    assert record.percentiles == pytest.approx([44, 56, 64, 88, 59, 85, 97])


def test_parse_player_escaped_literal_decodes_without_javascript():
    body = player_html().replace("Pedri", r"P\u00e9dri").replace("0.44", "0.0")
    record = parse_player(body, "2026-27", NOW)
    assert record.name == "Pédri"
    assert record.percentiles[0] == 0


def test_get_player_two_requests_share_one_cached_snapshot():
    seen = []

    def site(request):
        seen.append(request.url.path)
        if request.url.path == "/robots.txt":
            return httpx.Response(
                200,
                text="User-agent: *\nDisallow: /*.csv$\nDisallow: /*.xlsx$",
                headers={"content-type": "text/plain"},
            )
        return httpx.Response(200, text=player_html(), headers={"content-type": "text/html"})

    async def run():
        settings = ScraperSettings(
            _env_file=None,
            user_agent="RadarOfflineTests/1.0",
            jitter_ms=(0, 0),
            rate_per_s=0.2,
            burst=1,
            max_redirects=0,
            max_attempts=1,
        )
        client = ScrapingHttpClient(
            settings,
            clock=Clock(),
            transport=httpx.MockTransport(site),
            url_guard=allowed_url,
            robots_url=ORIGIN + "/robots.txt",
        )
        try:
            service = DataMBScraper(client)
            first, second = await asyncio.gather(
                service.get_player("Pedri_Midfielder_stats", "2026-27"),
                service.get_player("Pedri_Midfielder_stats", "2026-27"),
            )
            assert first == second
        finally:
            await client.aclose()

    asyncio.run(run())
    assert seen == ["/robots.txt", "/Pedri_Midfielder_stats/"]


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "body",
    [
        "",
        "<html>Just a moment...</html>",
        player_html().replace("const csvData", "const changed"),
        player_html().replace("0.44", "NaN"),
        player_html().replace("0.44", "1.01"),
        player_html().replace("2026/27", "2025/26"),
        player_html().replace(",769`", ",-1`"),
        player_html().replace("Pedri", "${execute()}"),
        player_html().replace("`;let", "` + getData();let"),
        player_html().replace("Minutes played", "Unexpected metadata"),
        player_html() + player_html(),
    ],
)
def test_parse_player_changed_or_dynamic_content_fails_closed(body):
    with pytest.raises(UnexpectedContentError):
        parse_player(body, "2026-27", NOW)


@pytest.mark.parametrize(
    "url",
    [
        "http://datamb.football/Pedri_Midfielder_stats/",
        "https://evil.test/Pedri_Midfielder_stats/",
        ORIGIN + "/database/searchbar.csv",
        ORIGIN + "/data.xlsx",
        ORIGIN + "/Pedri_Midfielder_stats/?x=1",
        "https://user@datamb.football/Pedri_Midfielder_stats/",
        ORIGIN + "/../Pedri_Midfielder_stats/",
    ],
)
def test_allowed_url_unsupported_surface_rejects_before_fetch(url):
    with pytest.raises(HostNotAllowedError):
        allowed_url(url)


@pytest.mark.parametrize(
    "robots,redirect,error",
    [
        ("User-agent: *\nDisallow: /", False, RobotsDisallowedError),
        ("User-agent: *\nAllow: /", True, UpstreamUnavailableError),
    ],
)
def test_get_player_robots_or_redirect_prevents_followup(robots, redirect, error):
    seen = []

    def site(request):
        seen.append(str(request.url))
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text=robots, headers={"content-type": "text/plain"})
        return httpx.Response(302, headers={"location": "https://evil.test/private"})

    async def run():
        settings = ScraperSettings(
            _env_file=None,
            user_agent="RadarOfflineTests/1.0",
            jitter_ms=(0, 0),
            max_redirects=0,
            max_attempts=1,
        )
        client = ScrapingHttpClient(
            settings,
            clock=Clock(),
            transport=httpx.MockTransport(site),
            url_guard=allowed_url,
            robots_url=ORIGIN + "/robots.txt",
        )
        try:
            with pytest.raises(error):
                await DataMBScraper(client).get_player("Pedri_Midfielder_stats", "2026-27")
        finally:
            await client.aclose()

    asyncio.run(run())
    assert all("evil.test" not in url for url in seen)
    assert len(seen) == (2 if redirect else 1)


def test_get_datamb_private_route_requires_token_and_explicit_enable():
    app = create_app(Settings(_env_file=None, scraping_service_token=SecretStr("service-token")))
    path = "/internal/radar/datamb?profile_key=Pedri_Midfielder_stats&season=2026-27"
    with TestClient(app) as client:
        assert client.get(path).status_code == 401
        response = client.get(path, headers={"X-Service-Token": "service-token"})
        assert response.status_code == 503
        assert response.json()["error"] == "provider_disabled"


# ---- Edge cases ---- #


def test_parse_player_percentile_fraction_not_reinterpreted_as_percentage():
    record = parse_player(player_html().replace("0.44", "0.007"), "2026-27", NOW)
    assert record.percentiles[0] == pytest.approx(0.7)


def test_get_player_failed_refresh_retains_old_snapshot_with_explicit_stale():
    from datetime import timedelta

    from fantasy_scraping.scraper.errors import UpstreamBlockedError

    class BlockedClient:
        async def get(self, url):
            raise UpstreamBlockedError()

    async def run():
        service = DataMBScraper(BlockedClient())
        old = parse_player(player_html(), "2026-27", datetime.now(UTC) - timedelta(days=2))
        service._cache[("Pedri_Midfielder_stats", "2026-27")] = old
        record = await service.get_player("Pedri_Midfielder_stats", "2026-27")
        assert record.stale is True
        assert record.fetched_at == old.fetched_at
        assert record.percentiles == old.percentiles

    asyncio.run(run())


@pytest.mark.parametrize("key", ["J_Bellingham_Midfielder_stats1", "Test_stats999"])
def test_allowed_url_observed_numeric_suffix_preserves_canonical_path(key):
    assert allowed_url(f"{ORIGIN}/{key}/") == f"{ORIGIN}/{key}/"


@pytest.mark.parametrize("key", ["Test_stats1000", "Test_stats1.csv", "Test_stats1?x=1"])
def test_allowed_url_invalid_numeric_suffix_rejects(key):
    with pytest.raises(HostNotAllowedError):
        allowed_url(f"{ORIGIN}/{key}/")
