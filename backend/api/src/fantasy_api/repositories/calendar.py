"""Repository for LaLiga Fantasy calendar and matchday resources."""

from __future__ import annotations

from typing import Any

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.repositories.paths import competition_path, stats_week_path


class CalendarRepository:
    """Build calendar paths and fetch upstream JSON without a bearer.

    Args:
        client: Shared Fantasy HTTP client.
        competition_id: Competition id in Fantasy paths (default ``1``).
    """

    def __init__(
        self,
        client: LaligaFantasyClient,
        *,
        competition_id: int = 1,
    ) -> None:
        self._client = client
        self._competition_id = competition_id

    async def get_current_week(self) -> Any:
        """Fetch current matchday metadata.

        Returns:
            Upstream JSON for ``GET {CMP}/week/current``.
        """
        path = competition_path(self._competition_id, "week", "current")
        return await self._client.get_public_json(path)

    async def get_fixtures(self, week: int) -> Any:
        """Fetch fixtures for a matchday.

        Args:
            week: Matchweek number.

        Returns:
            Upstream JSON for ``GET {CMP}/calendar?weekNumber={week}``.
        """
        path = competition_path(self._competition_id, "calendar")
        return await self._client.get_public_json(
            path,
            params={"weekNumber": week},
        )

    async def get_week_stats(self, week: int) -> Any:
        """Fetch matchday statistics and per-player week points.

        Args:
            week: Matchweek number.

        Returns:
            Upstream JSON for ``GET {ORIGIN}/stats/v1/competition/1/stats/week/{week}``.
        """
        path = stats_week_path(self._competition_id, week)
        return await self._client.get_public_json(path)
