"""Documented provider methods and public Fantasy club identity lookup."""

from typing import Any

from fantasy_api.clients.football import FootballClient
from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.repositories.paths import api_path


class StandingsRepository:
    """Fetch one configured provider league and its season data.

    Args:
        football: Shared provider HTTP client.
        fantasy: Shared Fantasy client for real-club ids.
        league_id: Provider league id, independently verified through metadata.
    """

    def __init__(
        self,
        football: FootballClient,
        fantasy: LaligaFantasyClient,
        *,
        league_id: int,
    ) -> None:
        self._football = football
        self._fantasy = fantasy
        self.league_id = league_id

    async def get_league(self) -> list[dict[str, Any]]:
        """Fetch provider competition identity and supported seasons."""
        return await self._football.get_rows("/leagues", {"id": self.league_id})

    async def get_standings(self, season: int) -> list[dict[str, Any]]:
        """Fetch the provider's authoritative, hourly table."""
        return await self._football.get_rows(
            "/standings",
            {"league": self.league_id, "season": season},
        )

    async def get_teams(self, season: int) -> list[dict[str, Any]]:
        """Fetch all participants for the selected season."""
        return await self._football.get_rows(
            "/teams",
            {"league": self.league_id, "season": season},
        )

    async def get_fixtures(self, season: int) -> list[dict[str, Any]]:
        """Fetch season fixtures in bulk rather than making per-club requests."""
        return await self._football.get_rows(
            "/fixtures",
            {"league": self.league_id, "season": season, "timezone": "UTC"},
        )

    async def get_clubs(self) -> Any:
        """Fetch public real-club ids without a LaLiga bearer."""
        return await self._fantasy.get_public_json(api_path("v3", "teams-master"))
