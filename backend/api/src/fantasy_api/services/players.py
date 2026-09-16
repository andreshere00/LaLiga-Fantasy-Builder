"""Players application service."""

from __future__ import annotations

from typing import Any

from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.repositories.players import PlayersRepository


class PlayersService:
    """Orchestrate public player reads and authenticated league cards.

    Catalog and market-value calls go to Fantasy without a bearer. The
    league-scoped card fetches a short-lived bearer first.

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
        """Return the public competition player catalog.

        Returns:
            Upstream players JSON (status, value, and points).
        """
        return await self._repository.list_players()

    async def get_market_value(self, player_id: str) -> Any:
        """Return public market-value history for a player.

        Args:
            player_id: Master Fantasy player identifier.

        Returns:
            Upstream market-value JSON.
        """
        return await self._repository.get_market_value(player_id)

    async def get_player_in_league(
        self,
        internal_jwt: str,
        player_id: str,
        league_id: str,
    ) -> Any:
        """Return a player card contextualized to a league.

        Args:
            internal_jwt: Auth-issued internal access token.
            player_id: Master Fantasy player identifier.
            league_id: Fantasy league identifier.

        Returns:
            Upstream league-scoped player JSON.
        """
        bearer = (await self._credentials.get_laliga_bearer(internal_jwt)).bearer_token
        return await self._repository.get_player_in_league(
            bearer,
            player_id,
            league_id,
        )
