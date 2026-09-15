"""Leagues application service."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.repositories.leagues import LeaguesRepository


class LeaguesService:
    """Orchestrate LaLiga bearer fetch and league repository calls.

    Args:
        credentials: Auth private credentials client.
        repository: Leagues repository.
    """

    def __init__(
        self,
        credentials: AuthCredentialsClient,
        repository: LeaguesRepository,
    ) -> None:
        self._credentials = credentials
        self._repository = repository

    async def _call[T](
        self,
        internal_jwt: str,
        method: Callable[..., Awaitable[T]],
        *args: object,
    ) -> T:
        """Fetch a bearer and invoke a repository method."""
        bearer = (await self._credentials.get_laliga_bearer(internal_jwt)).bearer_token
        return await method(bearer, *args)

    async def list_leagues(self, internal_jwt: str) -> Any:
        """Return competition leagues for the authenticated LaLiga user.

        Args:
            internal_jwt: Auth-issued internal access token.

        Returns:
            Upstream leagues JSON.
        """
        return await self._call(internal_jwt, self._repository.list_leagues)

    async def get_standing(self, internal_jwt: str, league_id: str) -> Any:
        """Return overall standing for a league.

        Args:
            internal_jwt: Auth-issued internal access token.
            league_id: Fantasy league identifier.

        Returns:
            Upstream standing JSON.
        """
        return await self._call(internal_jwt, self._repository.get_standing, league_id)

    async def get_standing_by_week(
        self,
        internal_jwt: str,
        league_id: str,
        week: int,
    ) -> Any:
        """Return standing for a league week.

        Args:
            internal_jwt: Auth-issued internal access token.
            league_id: Fantasy league identifier.
            week: Matchweek number.

        Returns:
            Upstream standing JSON.
        """
        return await self._call(
            internal_jwt,
            self._repository.get_standing_by_week,
            league_id,
            week,
        )

    async def get_activity(
        self,
        internal_jwt: str,
        league_id: str,
        page: int,
    ) -> Any:
        """Return a page of league activity.

        Args:
            internal_jwt: Auth-issued internal access token.
            league_id: Fantasy league identifier.
            page: Activity page index.

        Returns:
            Upstream activity JSON.
        """
        return await self._call(
            internal_jwt,
            self._repository.get_activity,
            league_id,
            page,
        )

    async def list_teams(self, internal_jwt: str, league_id: str) -> Any:
        """Return teams in a league.

        Args:
            internal_jwt: Auth-issued internal access token.
            league_id: Fantasy league identifier.

        Returns:
            Upstream teams JSON.
        """
        return await self._call(internal_jwt, self._repository.list_teams, league_id)

    async def get_team(
        self,
        internal_jwt: str,
        league_id: str,
        team_id: str,
    ) -> Any:
        """Return a team roster and clauses.

        Args:
            internal_jwt: Auth-issued internal access token.
            league_id: Fantasy league identifier.
            team_id: Fantasy team identifier.

        Returns:
            Upstream team JSON.
        """
        return await self._call(
            internal_jwt,
            self._repository.get_team,
            league_id,
            team_id,
        )
