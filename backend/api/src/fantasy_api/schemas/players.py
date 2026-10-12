"""Player catalog, market-value, and league player schemas for OpenAPI."""

from __future__ import annotations

from typing import Annotated

from pydantic import Field, StringConstraints

from fantasy_api.schemas.common import FantasyWireModel, JsonObject, JsonValue
from fantasy_api.schemas.leagues import Manager, PlayerMarket, PlayerMaster


class CatalogPlayer(FantasyWireModel):
    """Master player entry from ``GET /players``."""

    id: str | int | None = None
    nickname: str | None = None
    name: str | None = None
    slug: str | None = None
    position_id: int | None = None
    team_id: int | Annotated[str, StringConstraints(pattern=r"^[0-9]+$")] | None = None
    team: JsonObject | None = None
    player_status: str | None = None
    points: int | None = None
    average_points: float | int | None = Field(default=None, title="Average points")
    week_points: JsonValue | None = None
    market_value: int | None = None
    last_season_points: int | None = None
    images: JsonObject | None = None
    last_stats: list[JsonValue] | None = None


class PlayerMarketValue(FantasyWireModel):
    """One market-value history entry from ``GET /players/{id}/market-value``."""

    date: str | None = None
    market_value: int | None = None


class LeaguePlayer(FantasyWireModel):
    """Player card contextualized to a league.

    Path identifiers are master ``playerId`` values; the response may include
    the squad-entry ``playerTeamId`` alongside ownership and market blocks.
    """

    player_team_id: str | None = None
    buyout_clause: int | None = None
    buyout_clause_locked_end_time: str | None = None
    is_shielded: bool | None = None
    manager_id: int | str | None = None
    manager: Manager | None = None
    player_market: PlayerMarket | None = None
    player_master: PlayerMaster | None = None
