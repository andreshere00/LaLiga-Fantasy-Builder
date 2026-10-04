"""Scrape and parse one FutbolFantasy player document."""

from __future__ import annotations

from fantasy_scraping.models.page import PageKind
from fantasy_scraping.parser.errors import UnsupportedLayoutError
from fantasy_scraping.parser.models.futbolfantasy import FutbolFantasyPlayer
from fantasy_scraping.parser.service import ParserService
from fantasy_scraping.scraper.service import ScraperService

_FACADE_INCLUDE = frozenset(
    {PageKind.PLAYER, PageKind.MARKET_WIDGET, PageKind.COMPETITION},
)


class PlayerDocumentService:
    """Runs the scraper then the parser for one player."""

    def __init__(
        self,
        scraper: ScraperService,
        parser: ParserService | None = None,
    ) -> None:
        self._scraper = scraper
        self._parser = parser or ParserService()

    async def futbolfantasy(
        self,
        player_name: str,
        *,
        season: str,
        team: str | None = None,
        player_id: str | None = None,
        full_name: str | None = None,
    ) -> FutbolFantasyPlayer:
        """Return the merged parsed player for the requested season.

        Args:
            player_name: Catalog nickname used for route resolution.
            season: Season key such as ``2026-27``.
            team: Optional team name for disambiguation.
            player_id: Master player id for the alias table.
            full_name: Optional secondary name.

        Returns:
            Parsed FutbolFantasy player tree.

        Raises:
            ScrapingError: Resolution or download failed.
            ParserError: The downloaded pages could not be parsed.
        """
        pages = await self._scraper.scrape_player(
            player_name,
            season,
            team=team,
            player_id=player_id,
            full_name=full_name,
            include=_FACADE_INCLUDE,
        )
        profile = next(page for page in pages if page.kind == PageKind.PLAYER)
        companions = [page for page in pages if page is not profile]
        try:
            return self._parser.parse_futbolfantasy(profile, companions=companions)
        except UnsupportedLayoutError as exc:
            raise UnsupportedLayoutError(
                "scrape_layout_changed",
                "layout changed",
                section=exc.section,
            ) from exc
