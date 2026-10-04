"""Shared doubles for the scraper suite. No real network and no real sleeping."""

import random
from collections.abc import Callable

import httpx
import pytest

from fantasy_scraping.scraper.cache import MemoryCache
from fantasy_scraping.scraper.http_client import ScrapingHttpClient
from fantasy_scraping.scraper.service import ScraperService
from fantasy_scraping.scraper.settings import ScraperSettings

SLUGS: tuple[str, ...] = (
    "raphinha",
    "rochinha",
    "mikel-oyarzabal",
    "eduardo-camavinga",
    "inaki-williams",
    "danny-williams",
    "vinicius-junior",
    "vinicius-tanque",
    "gueye",
    "idrissa-gueye",
    "idrissa-gueye-1",
    "lamine-gueye",
    "lamine-gueye-1",
    "lamine-yamal",
    "lamine-camara",
    "inaki-lvarez",
    "vitinha",
    "vitinho",
)
TEAM_SLUGS: tuple[str, ...] = ("barcelona", "real-sociedad", "getafe")
PROFILE_HTML: str = """<html><body>
<a href="https://www.futbolfantasy.com/equipos/{team}">club</a>
<div data-jugador="4288"></div>
<select>
<option value="/jugadores/{slug}/champions-26-27" data-nombre-temporada="2026/27"></option>
<option value="/jugadores/{slug}/copa-del-rey-25-26" data-nombre-temporada="2025/26"></option>
<option value="/jugadores/{slug}/amistoso-26-27" data-nombre-temporada="2026/27"></option>
</select></body></html>"""
HTML = {"content-type": "text/html; charset=utf-8"}
XML = {"content-type": "application/xml"}


class FakeClock:
    """Clock whose sleep advances time instantly."""

    def __init__(self) -> None:
        """Start at zero."""
        self.now: float = 0.0
        self.slept: list[float] = []

    def monotonic(self) -> float:
        """Return the fake time."""
        return self.now

    async def sleep(self, seconds: float) -> None:
        """Advance time without waiting."""
        self.slept.append(seconds)
        self.now += seconds


def sitemap(slugs: tuple[str, ...], folder: str) -> str:
    """Build a minimal sitemap document."""
    locs = "".join(
        f"<url><loc>https://www.futbolfantasy.com/{folder}/{s}</loc></url>" for s in slugs
    )
    return f'<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{locs}</urlset>'


class FakeSite:
    """Routes MockTransport requests and records them."""

    def __init__(self, teams: dict[str, str] | None = None) -> None:
        """Create a site.

        Args:
            teams: Player slug to team slug. Unlisted players belong to barcelona.
        """
        self.teams: dict[str, str] = teams or {}
        self.requests: list[str] = []
        self.overrides: dict[str, httpx.Response] = {}

    def __call__(self, request: httpx.Request) -> httpx.Response:
        """Answer one request."""
        url = str(request.url)
        self.requests.append(url)
        path = request.url.path
        if url in self.overrides:
            return self.overrides[url]
        if path == "/robots.txt":
            return httpx.Response(
                200, text="User-agent: *\nDisallow:\n", headers={"content-type": "text/plain"}
            )
        if path == "/sitemap-jugadores.xml":
            return httpx.Response(200, text=sitemap(SLUGS, "jugadores"), headers=XML)
        if path == "/sitemap-equipos.xml":
            return httpx.Response(200, text=sitemap(TEAM_SLUGS, "equipos"), headers=XML)
        if path.startswith("/jugadores/"):
            slug = path.split("/")[2]
            return httpx.Response(
                200,
                text=PROFILE_HTML.format(slug=slug, team=self.teams.get(slug, "barcelona")),
                headers=HTML,
            )
        if path.startswith("/analytics/"):
            return httpx.Response(200, text="<html><body>widget</body></html>", headers=HTML)
        return httpx.Response(404)

    def count(self, fragment: str) -> int:
        """Count recorded requests containing ``fragment``."""
        return sum(fragment in url for url in self.requests)


@pytest.fixture
def clock() -> FakeClock:
    """Fake clock."""
    return FakeClock()


@pytest.fixture
def settings() -> ScraperSettings:
    """Settings with no jitter and a test contact."""
    return ScraperSettings(contact="test@example.com", jitter_ms=(0, 0), rate_per_s=3, burst=100)


@pytest.fixture
def site() -> FakeSite:
    """Default fake site."""
    return FakeSite()


@pytest.fixture
def make_client(
    settings: ScraperSettings, clock: FakeClock
) -> Callable[[Callable[[httpx.Request], httpx.Response]], ScrapingHttpClient]:
    """Build a client over a handler."""

    def factory(handler: Callable[[httpx.Request], httpx.Response]) -> ScrapingHttpClient:
        return ScrapingHttpClient(
            settings, transport=httpx.MockTransport(handler), clock=clock, rng=random.Random(1)
        )

    return factory


@pytest.fixture
def service(
    site: FakeSite,
    make_client: Callable[..., ScrapingHttpClient],
    settings: ScraperSettings,
    clock: FakeClock,
) -> ScraperService:
    """Service over the fake site with an in-memory cache."""
    return ScraperService(
        make_client(site), MemoryCache(clock), settings, aliases={"3102": "vinicius-junior"}
    )
