"""Official classification plus every documented public Fantasy matchweek."""

import asyncio
from typing import Any

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.clients.scraping import ScrapingClient
from fantasy_api.repositories.calendar import CalendarRepository
from fantasy_api.repositories.paths import api_path
from fantasy_api.schemas.payload import as_object_list


class FixtureStandingsRepository:
    """Fetch inputs without any private LaLiga bearer exchange.

    Args:
        fantasy: Public Fantasy calendar and club directory client.
        scraping: Private official standings scraper client.
        competition_id: Configured application competition.
    """

    def __init__(
        self, fantasy: LaligaFantasyClient, scraping: ScrapingClient, *, competition_id: int
    ) -> None:
        self._fantasy = fantasy
        self._scraping = scraping
        self._calendar = CalendarRepository(fantasy, competition_id=competition_id)

    async def get_official_standings(self) -> Any:
        """Fetch the cached official table, allowing its initial polite crawl delay."""
        return await self._scraping.get_json("/internal/scrape/standings", {}, timeout_seconds=90.0)

    async def get_clubs(self) -> Any:
        """Fetch the public club directory to verify real-club identities."""
        return await self._fantasy.get_public_json(api_path("v3", "teams-master"))

    async def get_fixtures(self) -> list[dict[str, Any]]:
        """Fetch all 38 weeks, including rearranged fixtures, with four concurrent reads."""
        gate = asyncio.Semaphore(4)

        async def fetch(week: int) -> list[dict[str, Any]]:
            """Read and validate one calendar collection."""
            async with gate:
                return as_object_list(await self._calendar.get_fixtures(week))

        tasks = [asyncio.create_task(fetch(week)) for week in range(1, 39)]
        try:
            pages = await asyncio.gather(*tasks)
        except BaseException:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise
        return [row for page in pages for row in page]
