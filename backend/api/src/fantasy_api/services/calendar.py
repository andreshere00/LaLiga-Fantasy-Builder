"""Calendar application service."""

from __future__ import annotations

from typing import Any

from fantasy_api.repositories.calendar import CalendarRepository


class CalendarService:
    """Orchestrate public Fantasy calendar reads.

    Args:
        repository: Calendar repository.
    """

    def __init__(self, repository: CalendarRepository) -> None:
        self._repository = repository

    async def get_current_week(self) -> Any:
        """Return current matchday metadata.

        Returns:
            Upstream current week JSON.
        """
        return await self._repository.get_current_week()

    async def get_fixtures(self, week: int) -> Any:
        """Return fixtures for a matchday.

        Args:
            week: Matchweek number.

        Returns:
            Upstream calendar JSON.
        """
        return await self._repository.get_fixtures(week)

    async def get_week_stats(self, week: int) -> Any:
        """Return matchday statistics and results.

        Args:
            week: Matchweek number.

        Returns:
            Upstream stats JSON.
        """
        return await self._repository.get_week_stats(week)
