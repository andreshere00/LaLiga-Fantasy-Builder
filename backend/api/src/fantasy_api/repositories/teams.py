"""Repository for LaLiga Fantasy team money and lineup resources."""

from __future__ import annotations

from typing import Any

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.repositories.paths import competition_path


class TeamsRepository:
    """Build competition team paths and call the Fantasy HTTP client.

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

    def _path(self, *parts: str | int) -> str:
        """Build a path under ``{CMP}/teams/...``."""
        return competition_path(self._competition_id, "teams", *parts)

    async def get_money(self, bearer_token: str, team_id: str) -> Any:
        """Fetch team cash and investment.

        Args:
            bearer_token: LaLiga bearer token.
            team_id: Fantasy team identifier.

        Returns:
            Upstream JSON for ``GET {CMP}/teams/{teamId}/money``.
        """
        return await self._client.get_json(self._path(team_id, "money"), bearer_token)

    async def get_lineup(self, bearer_token: str, team_id: str) -> Any:
        """Fetch the current team lineup.

        Args:
            bearer_token: LaLiga bearer token.
            team_id: Fantasy team identifier.

        Returns:
            Upstream JSON for ``GET {CMP}/teams/{teamId}/lineup``.
        """
        return await self._client.get_json(self._path(team_id, "lineup"), bearer_token)

    async def get_lineup_by_week(
        self,
        bearer_token: str,
        team_id: str,
        week: int,
    ) -> Any:
        """Fetch a team lineup for a matchweek.

        Args:
            bearer_token: LaLiga bearer token.
            team_id: Fantasy team identifier.
            week: Matchweek number.

        Returns:
            Upstream JSON for ``GET {CMP}/teams/{teamId}/lineup/week/{week}``.
        """
        path = self._path(team_id, "lineup", "week", week)
        return await self._client.get_json(path, bearer_token)

    async def put_lineup(
        self,
        bearer_token: str,
        team_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Replace the current team lineup.

        Args:
            bearer_token: LaLiga bearer token.
            team_id: Fantasy team identifier.
            body: Lineup write payload (playerTeamId slots).

        Returns:
            Upstream JSON for ``PUT {CMP}/teams/{teamId}/lineup``.
        """
        return await self._client.put_json(
            self._path(team_id, "lineup"),
            bearer_token,
            body,
        )
