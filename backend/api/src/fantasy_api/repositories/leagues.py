"""Repository for LaLiga Fantasy league resources."""

from __future__ import annotations

from typing import Any

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient


class LeaguesRepository:
    """Build competition league paths and fetch upstream JSON.

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

    @property
    def _base_path(self) -> str:
        """Competition leagues collection prefix."""
        return f"/api/v1/competition/{self._competition_id}/leagues"

    async def list_leagues(self, bearer_token: str) -> Any:
        """Fetch leagues for the competition.

        Args:
            bearer_token: LaLiga bearer token.

        Returns:
            Upstream JSON for ``GET {CMP}/leagues``.
        """
        return await self._client.get_json(self._base_path, bearer_token)

    async def get_standing(self, bearer_token: str, league_id: str) -> Any:
        """Fetch overall league standing.

        Args:
            bearer_token: LaLiga bearer token.
            league_id: Fantasy league identifier.

        Returns:
            Upstream JSON for ``GET {CMP}/leagues/{leagueId}/standing``.
        """
        path = f"{self._base_path}/{league_id}/standing"
        return await self._client.get_json(path, bearer_token)

    async def get_standing_by_week(
        self,
        bearer_token: str,
        league_id: str,
        week: int,
    ) -> Any:
        """Fetch league standing for a single week.

        Args:
            bearer_token: LaLiga bearer token.
            league_id: Fantasy league identifier.
            week: Matchweek number.

        Returns:
            Upstream JSON for ``GET {CMP}/leagues/{leagueId}/standing/{week}``.
        """
        path = f"{self._base_path}/{league_id}/standing/{week}"
        return await self._client.get_json(path, bearer_token)

    async def get_activity(
        self,
        bearer_token: str,
        league_id: str,
        page: int,
    ) -> Any:
        """Fetch paginated league activity.

        Args:
            bearer_token: LaLiga bearer token.
            league_id: Fantasy league identifier.
            page: Activity page index (typically starts at ``0``).

        Returns:
            Upstream JSON for ``GET {CMP}/leagues/{leagueId}/activity/{page}``.
        """
        path = f"{self._base_path}/{league_id}/activity/{page}"
        return await self._client.get_json(path, bearer_token)

    async def list_teams(self, bearer_token: str, league_id: str) -> Any:
        """Fetch teams/managers in a league.

        Args:
            bearer_token: LaLiga bearer token.
            league_id: Fantasy league identifier.

        Returns:
            Upstream JSON for ``GET {CMP}/leagues/{leagueId}/teams``.
        """
        path = f"{self._base_path}/{league_id}/teams"
        return await self._client.get_json(path, bearer_token)

    async def get_team(
        self,
        bearer_token: str,
        league_id: str,
        team_id: str,
    ) -> Any:
        """Fetch a team roster and clauses.

        Args:
            bearer_token: LaLiga bearer token.
            league_id: Fantasy league identifier.
            team_id: Fantasy team identifier.

        Returns:
            Upstream JSON for ``GET {CMP}/leagues/{leagueId}/teams/{teamId}``.
        """
        path = f"{self._base_path}/{league_id}/teams/{team_id}"
        return await self._client.get_json(path, bearer_token)
