"""Players application service."""

from __future__ import annotations

from typing import Any

from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.repositories.players import PlayersRepository
from fantasy_api.services.laliga import with_laliga_bearer


class PlayersService:
    """Orchestrate public player reads and league-contextual player calls.

    Args:
        credentials: Auth private credentials client.
        repository: Players repository.
    """

    def __init__(
        self,
        credentials: AuthCredentialsClient,
        repository: PlayersRepository,
    ) -> None:
        self._credentials = credentials
        self._repository = repository

    async def list_players(self) -> Any:
        """Return the full public player catalog.

        Returns:
            Upstream catalog JSON.
        """
        return await self._repository.list_players()

    async def get_market_value(self, player_id: str) -> Any:
        """Return public market-value history for a player.

        Args:
            player_id: Master footballer identifier.

        Returns:
            Upstream market-value JSON.
        """
        return await self._repository.get_market_value(player_id)

    async def get_league_player(
        self,
        internal_jwt: str,
        player_id: str,
        league_id: str,
    ) -> Any:
        """Return a player card contextualized to a league.

        Args:
            internal_jwt: Auth-issued internal access token.
            player_id: Master footballer identifier.
            league_id: Fantasy league identifier.

        Returns:
            Upstream league player JSON.
        """
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.get_league_player,
            player_id,
            league_id,
        )
