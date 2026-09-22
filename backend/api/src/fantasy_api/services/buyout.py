"""Buyout clause and shielding application service."""

from __future__ import annotations

from typing import Any

from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.repositories.buyout import BuyoutRepository
from fantasy_api.services.laliga import with_laliga_bearer


class BuyoutService:
    """Orchestrate LaLiga bearer fetch and buyout repository calls.

    Args:
        credentials: Auth private credentials client.
        repository: Buyout repository.
    """

    def __init__(
        self,
        credentials: AuthCredentialsClient,
        repository: BuyoutRepository,
    ) -> None:
        self._credentials = credentials
        self._repository = repository

    async def pay_buyout(
        self,
        internal_jwt: str,
        league_id: str,
        player_team_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Pay a buyout clause for a squad entry.

        Args:
            internal_jwt: Auth-issued internal access token.
            league_id: Fantasy league identifier.
            player_team_id: Squad-entry identifier (``playerTeamId``).
            body: Pay buyout write payload.

        Returns:
            Upstream mutation JSON (may be empty).
        """
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.pay_buyout,
            league_id,
            player_team_id,
            body,
        )

    async def increase_buyout(
        self,
        internal_jwt: str,
        league_id: str,
        player_team_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Set or increase a buyout clause for a squad entry.

        Args:
            internal_jwt: Auth-issued internal access token.
            league_id: Fantasy league identifier.
            player_team_id: Squad-entry identifier (``playerTeamId``).
            body: Increase buyout write payload.

        Returns:
            Upstream mutation JSON (may be empty).
        """
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.increase_buyout,
            league_id,
            player_team_id,
            body,
        )

    async def check_shield(
        self,
        internal_jwt: str,
        league_id: str,
        player_team_id: str,
    ) -> Any:
        """Return shield status for a squad entry.

        Args:
            internal_jwt: Auth-issued internal access token.
            league_id: Fantasy league identifier.
            player_team_id: Squad-entry identifier (``playerTeamId``).

        Returns:
            Upstream shield status JSON.
        """
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.check_shield,
            league_id,
            player_team_id,
        )

    async def activate_shield(
        self,
        internal_jwt: str,
        league_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Activate shielding for a squad entry.

        Args:
            internal_jwt: Auth-issued internal access token.
            league_id: Fantasy league identifier.
            body: Shield write payload.

        Returns:
            Upstream mutation JSON (may be empty).
        """
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.activate_shield,
            league_id,
            body,
        )
