"""Teams application service."""

from __future__ import annotations

from typing import Any

from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.repositories.teams import TeamsRepository
from fantasy_api.services.laliga import with_laliga_bearer


class TeamsService:
    """Orchestrate LaLiga bearer fetch and team repository calls.

    Args:
        credentials: Auth private credentials client.
        repository: Teams repository.
    """

    def __init__(
        self,
        credentials: AuthCredentialsClient,
        repository: TeamsRepository,
    ) -> None:
        self._credentials = credentials
        self._repository = repository

    async def get_money(self, internal_jwt: str, team_id: str) -> Any:
        """Return team cash and investment.

        Args:
            internal_jwt: Auth-issued internal access token.
            team_id: Fantasy team identifier.

        Returns:
            Upstream money JSON.
        """
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.get_money,
            team_id,
        )

    async def get_lineup(self, internal_jwt: str, team_id: str) -> Any:
        """Return the current team lineup.

        Args:
            internal_jwt: Auth-issued internal access token.
            team_id: Fantasy team identifier.

        Returns:
            Upstream lineup JSON.
        """
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.get_lineup,
            team_id,
        )

    async def get_lineup_by_week(
        self,
        internal_jwt: str,
        team_id: str,
        week: int,
    ) -> Any:
        """Return a team lineup for a matchweek.

        Args:
            internal_jwt: Auth-issued internal access token.
            team_id: Fantasy team identifier.
            week: Matchweek number.

        Returns:
            Upstream lineup JSON.
        """
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.get_lineup_by_week,
            team_id,
            week,
        )

    async def put_lineup(
        self,
        internal_jwt: str,
        team_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Replace the current team lineup.

        Args:
            internal_jwt: Auth-issued internal access token.
            team_id: Fantasy team identifier.
            body: Lineup write payload.

        Returns:
            Upstream lineup JSON (may be empty).
        """
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.put_lineup,
            team_id,
            body,
        )
