"""Repository for player stats upstream calls."""

from __future__ import annotations

import re
from typing import Any

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.clients.openweather import OpenWeatherClient
from fantasy_api.clients.scraping import ScrapingClient
from fantasy_api.repositories.paths import api_path, competition_path

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_FUTBOLFANTASY_PATH = "/internal/players/futbolfantasy"


class PlayerStatsRepository:
    """Scraping, weather, and teams-master reads for player stats."""

    def __init__(
        self,
        fantasy: LaligaFantasyClient,
        scraping: ScrapingClient,
        weather: OpenWeatherClient,
        *,
        competition_id: int = 1,
    ) -> None:
        self._fantasy = fantasy
        self._scraping = scraping
        self._weather = weather
        self._competition_id = competition_id

    async def get_teams_master(self) -> Any:
        """Fetch public teams-master metadata."""
        path = api_path("v3", "teams-master")
        return await self._fantasy.get_public_json(path)

    async def get_market_history(self, player_id: str) -> Any:
        """Fetch public market-value history."""
        path = competition_path(
            self._competition_id,
            "player",
            player_id,
            "market-value",
        )
        return await self._fantasy.get_json(path)

    async def get_futbolfantasy(
        self,
        name: str,
        season_slug: str,
        team: str | None,
    ) -> Any:
        """Fetch parsed FutbolFantasy JSON from the scraping service."""
        params = {
            "player_name": _clean_param(name),
            "season": _clean_param(season_slug),
        }
        if team:
            params["team"] = _clean_param(team)
        return await self._scraping.get_json(_FUTBOLFANTASY_PATH, params)

    async def get_forecast(self, lat: float, lon: float) -> Any:
        """Fetch OpenWeather forecast JSON for a venue."""
        return await self._weather.forecast(lat, lon)


def _clean_param(value: str) -> str:
    text = _CONTROL.sub("", value.strip())
    return text[:80]
