"""Sitemap-backed player and team index."""

import asyncio
from datetime import UTC, datetime
from urllib.parse import urlsplit

from defusedxml import DefusedXmlException
from defusedxml import ElementTree as SafeET

from fantasy_scraping.scraper.cache import INDEX_KEY, PageCache
from fantasy_scraping.scraper.errors import (
    LinkDataUnavailableError,
    ScrapingError,
    UnexpectedContentError,
)
from fantasy_scraping.scraper.flight import SingleFlight
from fantasy_scraping.scraper.http_client import XML_TYPES, ScrapingHttpClient
from fantasy_scraping.scraper.models import LinkedData
from fantasy_scraping.scraper.settings import ScraperSettings
from fantasy_scraping.scraper.urls import PLAYERS_SITEMAP_URL, SLUG_RE, TEAMS_SITEMAP_URL


def _slugs(xml: str) -> tuple[str, ...]:
    """Extract the last path segment of every ``<loc>`` in a sitemap."""
    try:
        root = SafeET.fromstring(xml)
    except (SafeET.ParseError, DefusedXmlException) as exc:
        raise UnexpectedContentError() from exc
    found = (
        urlsplit((el.text or "").strip()).path.rstrip("/").rsplit("/", 1)[-1]
        for el in root.iter()
        if el.tag.endswith("loc")
    )
    slugs = tuple(dict.fromkeys(s for s in found if SLUG_RE.fullmatch(s)))
    if not slugs:
        raise UnexpectedContentError()
    return slugs


class LinkedDataProvider:
    """Builds and caches the sitemap index."""

    def __init__(
        self, client: ScrapingHttpClient, cache: PageCache, settings: ScraperSettings
    ) -> None:
        """Bind collaborators.

        Args:
            client: Guarded HTTP client.
            cache: Page cache.
            settings: Scraper settings.
        """
        self._client: ScrapingHttpClient = client
        self._cache: PageCache = cache
        self._settings: ScraperSettings = settings
        self._flight: SingleFlight = SingleFlight()

    async def get(self, *, refresh: bool = False) -> LinkedData:
        """Return the index, refreshing when stale or forced.

        Args:
            refresh: Skip the fresh cache hit.

        Returns:
            The player and team index. A stale copy is served when the refresh fails.

        Raises:
            LinkDataUnavailableError: Refresh failed and no stale copy exists.
        """
        hit = self._cache.get(INDEX_KEY)
        if hit and hit.fresh and not refresh:
            return hit.value
        try:
            data = await self._flight.run(INDEX_KEY, self._build)
        except ScrapingError as exc:
            if hit:
                return hit.value
            raise LinkDataUnavailableError() from exc
        self._cache.set(INDEX_KEY, data, self._settings.ttl_index_s, self._settings.swr_index_s)
        return data

    async def _build(self) -> LinkedData:
        """Download both sitemaps and parse them off the event loop."""
        cap = self._settings.max_sitemap_bytes
        players = await self._client.get(PLAYERS_SITEMAP_URL, accept=XML_TYPES, max_bytes=cap)
        teams = await self._client.get(TEAMS_SITEMAP_URL, accept=XML_TYPES, max_bytes=cap)
        player_slugs, team_slugs = await asyncio.gather(
            asyncio.to_thread(_slugs, players.text), asyncio.to_thread(_slugs, teams.text)
        )
        return LinkedData(
            player_slugs=player_slugs, team_slugs=team_slugs, fetched_at=datetime.now(UTC)
        )
