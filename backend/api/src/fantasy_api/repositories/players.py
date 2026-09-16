"""Repository for LaLiga Fantasy player resources."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient


class PlayersRepository:
    """Build competition player paths and fetch upstream JSON.

    Public catalog and market-value reads omit the LaLiga bearer. The
    league-scoped player card is a private Fantasy resource.

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
        """Competition prefix shared by player collection and item paths."""
        return f"/api/v1/competition/{self._competition_id}"

    async def list_players(self) -> Any:
        """Fetch the public player catalog.

        Returns:
            Upstream JSON for ``GET {CMP}/players``.
        """
        return await self._client.get_json(f"{self._base_path}/players")

    async def get_market_value(self, player_id: str) -> Any:
        """Fetch public market-value history for a player.

        Args:
            player_id: Master Fantasy player identifier.

        Returns:
            Upstream JSON for ``GET {CMP}/player/{playerId}/market-value``.
        """
        path = f"{self._base_path}/player/{_segment(player_id)}/market-value"
        return await self._client.get_json(path)

    async def get_player_in_league(
        self,
        bearer_token: str,
        player_id: str,
        league_id: str,
    ) -> Any:
        """Fetch a player card contextualized to a league.

        Args:
            bearer_token: LaLiga bearer token.
            player_id: Master Fantasy player identifier.
            league_id: Fantasy league identifier.

        Returns:
            Upstream JSON for ``GET {CMP}/player/{playerId}/league/{leagueId}``.
        """
        path = f"{self._base_path}/player/{_segment(player_id)}" f"/league/{_segment(league_id)}"
        return await self._client.get_json(path, bearer_token)


def _segment(value: str) -> str:
    """Percent-encode a path identifier so it cannot change the upstream path."""
    return quote(str(value), safe="")
