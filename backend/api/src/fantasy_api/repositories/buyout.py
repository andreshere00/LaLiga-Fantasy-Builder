"""Repository for LaLiga Fantasy buyout clauses and shielding."""

from __future__ import annotations

from typing import Any

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.repositories.paths import competition_path


class BuyoutRepository:
    """Build competition league buyout paths and call the Fantasy HTTP client.

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

    def _league_path(self, league_id: str, *parts: str | int) -> str:
        """Build a path under ``{CMP}/league/{leagueId}/...``."""
        return competition_path(self._competition_id, "league", league_id, *parts)

    async def pay_buyout(
        self,
        bearer_token: str,
        league_id: str,
        player_team_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Pay a buyout clause for a squad entry."""
        path = self._league_path(league_id, "buyout", player_team_id, "pay")
        return await self._client.post_json(path, bearer_token, body)

    async def increase_buyout(
        self,
        bearer_token: str,
        league_id: str,
        player_team_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Set or increase a buyout clause for a squad entry."""
        path = self._league_path(league_id, "buyout", player_team_id, "increase")
        return await self._client.post_json(path, bearer_token, body)

    async def check_shield(
        self,
        bearer_token: str,
        league_id: str,
        player_team_id: str,
    ) -> Any:
        """Fetch shield status for a squad entry."""
        path = self._league_path(
            league_id,
            "player-team",
            player_team_id,
            "check-shield",
        )
        return await self._client.get_json(path, bearer_token)

    async def activate_shield(
        self,
        bearer_token: str,
        league_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Activate shielding for a squad entry."""
        path = self._league_path(league_id, "shield", "player")
        return await self._client.put_json(path, bearer_token, body)
