"""Leagues application service."""

from __future__ import annotations

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

    async def _bearer(self, internal_jwt: str) -> str:
        """Resolve a short-lived LaLiga bearer for the JWT subject."""
        bundle = await self._credentials.get_laliga_bearer(internal_jwt)
        return bundle.bearer_token

    async def list_leagues(self, internal_jwt: str) -> Any:
        """Return competition leagues for the authenticated LaLiga user.

        Args:
            internal_jwt: Auth-issued internal access token.

        Returns:
            Upstream leagues JSON.
        """
        bearer = await self._bearer(internal_jwt)
        return await self._repository.list_leagues(bearer)

    async def get_standing(self, internal_jwt: str, league_id: str) -> Any:
        """Return overall standing for a league.

        Args:
            internal_jwt: Auth-issued internal access token.
            league_id: Fantasy league identifier.

        Returns:
            Upstream standing JSON.
        """
        bearer = await self._bearer(internal_jwt)
        return await self._repository.get_standing(bearer, league_id)

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
        bearer = await self._bearer(internal_jwt)
        return await self._repository.get_standing_by_week(bearer, league_id, week)

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
        bearer = await self._bearer(internal_jwt)
        return await self._repository.get_activity(bearer, league_id, page)

    async def list_teams(self, internal_jwt: str, league_id: str) -> Any:
        """Return teams in a league.

        Args:
            internal_jwt: Auth-issued internal access token.
            league_id: Fantasy league identifier.

        Returns:
            Upstream teams JSON.
        """
        bearer = await self._bearer(internal_jwt)
        return await self._repository.list_teams(bearer, league_id)

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
        bearer = await self._bearer(internal_jwt)
        return await self._repository.get_team(bearer, league_id, team_id)
