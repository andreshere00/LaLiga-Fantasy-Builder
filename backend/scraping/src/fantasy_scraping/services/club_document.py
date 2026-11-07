"""Scrape and parse one FutbolFantasy club dossier."""

from __future__ import annotations

from fantasy_scraping.parser.extractors.club_news import parse_club_news
from fantasy_scraping.parser.extractors.club_page import parse_club_page
from fantasy_scraping.parser.models.club_page import ClubNewsDocument, ClubPageDocument
from fantasy_scraping.scraper.service import ScraperService


class ClubDocumentService:
    """Runs the scraper then the parser for one club."""

    def __init__(self, scraper: ScraperService) -> None:
        self._scraper = scraper

    async def page(self, slug: str) -> ClubPageDocument:
        """Download and parse one club page.

        Args:
            slug: FutbolFantasy club slug.

        Returns:
            The parsed club dossier sections that live on the club page.

        Raises:
            ScrapingError: The slug or download failed.
        """
        return parse_club_page(await self._scraper.download_club(slug))

    async def news(self, slug: str) -> ClubNewsDocument:
        """Download and parse the five newest club headlines.

        Args:
            slug: FutbolFantasy club slug.

        Returns:
            Changelog headlines and article links.

        Raises:
            ScrapingError: The slug or download failed.
        """
        return parse_club_news(await self._scraper.download_club_news(slug))
