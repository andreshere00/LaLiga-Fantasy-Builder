"""Repository for LaLiga Fantasy player catalog and league player resources."""

from __future__ import annotations

from typing import Any

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.repositories.paths import competition_path


class PlayersRepository:
    """Build competition player paths and call the Fantasy HTTP client.

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

    async def list_players(self) -> Any:
        """Fetch the full public player catalog.

        Returns:
            Upstream JSON for ``GET {CMP}/players``.
        """
        path = competition_path(self._competition_id, "players")
        return await self._client.get_json(path)

    async def get_market_value(self, player_id: str) -> Any:
        """Fetch public market-value history for a player.

        Args:
            player_id: Master footballer identifier.

        Returns:
            Upstream JSON for ``GET {CMP}/player/{playerId}/market-value``.
        """
        path = competition_path(self._competition_id, "player", player_id, "market-value")
        return await self._client.get_json(path)

    async def get_league_player(
        self,
        bearer_token: str,
        player_id: str,
        league_id: str,
    ) -> Any:
        """Fetch a player card contextualized to a league.

        Args:
            bearer_token: LaLiga bearer token.
            player_id: Master footballer identifier.
            league_id: Fantasy league identifier.

        Returns:
            Upstream JSON for ``GET {CMP}/player/{playerId}/league/{leagueId}``.
        """
        path = competition_path(
            self._competition_id, "player", player_id, "league", league_id
        )
        return await self._client.get_json(path, bearer_token)
