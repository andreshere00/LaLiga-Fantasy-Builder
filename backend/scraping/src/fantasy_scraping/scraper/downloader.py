"""Guard, cache, fetch and sanitise one page."""

from datetime import UTC, datetime

from fantasy_scraping.models.page import PageKind, ScrapedPage, Source
from fantasy_scraping.scraper.cache import PageCache, page_key
from fantasy_scraping.scraper.errors import ScrapingError
from fantasy_scraping.scraper.flight import SingleFlight
from fantasy_scraping.scraper.http_client import ScrapingHttpClient
from fantasy_scraping.scraper.models import ScrapeOptions
from fantasy_scraping.scraper.sanitise import sanitise_html
from fantasy_scraping.scraper.settings import ScraperSettings
from fantasy_scraping.scraper.urls import player_url, widget_url


class PageDownloader:
    """Cache-first page download with request coalescing."""

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

    async def download(
        self,
        kind: PageKind,
        *,
        player_slug: str,
        season: str,
        season_slug: str,
        widget_id: str | None = None,
        options: ScrapeOptions | None = None,
    ) -> ScrapedPage:
        """Return one page, from cache when fresh.

        Args:
            kind: Player sheet, market widget or competition page.
            player_slug: Validated route slug.
            season: Season key such as ``2026-27``.
            season_slug: Route segment such as ``laliga-26-27`` or ``champions-26-27``.
            widget_id: Numeric id, required for the market widget.
            options: Per-request options.

        Returns:
            The page. ``from_cache`` is True on a cache read.

        Raises:
            ScrapingError: Any guard, upstream or content failure with no stale copy.
        """
        if kind is PageKind.MARKET_WIDGET:
            url, ttl, key = widget_url(widget_id or ""), self._settings.ttl_market_s, ""
            key = page_key("market", widget_id or "")
        elif kind is PageKind.COMPETITION:
            url = player_url(player_slug, season_slug)
            ttl, key = self._settings.ttl_competition_s, page_key("ff", season_slug, player_slug)
        else:
            url = player_url(player_slug, season_slug)
            ttl, key = self._settings.ttl_profile_s, page_key("profile", season, player_slug)
        hit = self._cache.get(key)
        if hit and hit.fresh and not (options and options.bypass_cache):
            return hit.value.model_copy(update={"from_cache": True})

        async def fetch() -> ScrapedPage:
            response = await self._client.get(url)
            return ScrapedPage(
                source=Source.FUTBOLFANTASY,
                kind=kind,
                url=url,
                fetched_at=datetime.now(UTC),
                status_code=response.status,
                html=sanitise_html(response.text),
                season=season,
                player_slug=player_slug,
                season_slug=season_slug,
            )

        try:
            page = await self._flight.run(key, fetch)
        except ScrapingError:
            if hit:
                return hit.value.model_copy(update={"from_cache": True})
            raise
        self._cache.set(key, page, ttl, self._settings.swr_page_s)
        return page
