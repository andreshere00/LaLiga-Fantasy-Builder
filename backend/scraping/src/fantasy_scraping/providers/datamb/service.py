"""Isolated, cache-first DataMB transport with robots and no redirects or bulk files."""

import asyncio
import re
from collections import OrderedDict
from datetime import UTC, datetime
from urllib.parse import urlsplit

from fantasy_scraping.providers.datamb.parser import DataMBPlayer, parse_player
from fantasy_scraping.scraper.errors import HostNotAllowedError, ScrapingError
from fantasy_scraping.scraper.http_client import ScrapingHttpClient
from fantasy_scraping.scraper.settings import ScraperSettings

ORIGIN = "https://datamb.football"


def allowed_url(url: str) -> str:
    """Allow only canonical HTTPS profile pages and the robots policy."""
    parts = urlsplit(url)
    if (
        parts.scheme != "https"
        or parts.netloc != "datamb.football"
        or parts.query
        or parts.fragment
        or not (
            parts.path == "/robots.txt" or re.fullmatch(r"/[A-Za-z0-9_-]{1,120}_stats/", parts.path)
        )
    ):
        raise HostNotAllowedError()
    return url


class DataMBScraper:
    """Download one reviewed profile at a time, caching at most 256 daily snapshots."""

    def __init__(self, client: ScrapingHttpClient) -> None:
        self._client = client
        self._cache: OrderedDict[tuple[str, str], DataMBPlayer] = OrderedDict()
        self._lock = asyncio.Lock()

    async def get_player(self, profile_key: str, season: str) -> DataMBPlayer:
        """Read a current profile; historical season mismatches fail explicitly."""
        key = (profile_key, season)
        async with self._lock:
            row = self._cache.get(key)
            if row and (datetime.now(UTC) - row.fetched_at).total_seconds() < 86400:
                self._cache.move_to_end(key)
                return row
            try:
                response = await self._client.get(allowed_url(f"{ORIGIN}/{profile_key}/"))
                fresh = parse_player(response.text, season, datetime.now(UTC))
            except ScrapingError:
                if row and (datetime.now(UTC) - row.fetched_at).total_seconds() < 7 * 86400:
                    return row.model_copy(update={"stale": True})
                raise
            row = fresh
            self._cache[key] = row
            self._cache.move_to_end(key)
            while len(self._cache) > 256:
                self._cache.popitem(last=False)
            return row


def build_datamb_scraper(settings: ScraperSettings) -> tuple[DataMBScraper, ScrapingHttpClient]:
    """Create a separately limited client; no redirects can escape its robots check."""
    polite = settings.model_copy(
        update={
            "rate_per_s": 0.2,
            "burst": 1,
            "host_concurrency": 1,
            "max_redirects": 0,
            "max_attempts": 1,
        }
    )
    client = ScrapingHttpClient(polite, url_guard=allowed_url, robots_url=f"{ORIGIN}/robots.txt")
    return DataMBScraper(client), client
