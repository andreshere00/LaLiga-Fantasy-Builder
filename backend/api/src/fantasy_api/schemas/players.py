"""Player catalog, market-value, and league player schemas for OpenAPI."""

from __future__ import annotations

from typing import Any

from fantasy_api.schemas.common import FlexibleModel


class CatalogPlayer(FlexibleModel):
    """Master player entry from ``GET /players``."""

    id: str | int | None = None
    nickname: str | None = None
    name: str | None = None
    slug: str | None = None
    positionId: int | None = None
    teamId: int | str | None = None
    team: dict[str, Any] | None = None
    playerStatus: str | None = None
    points: int | None = None
    averagePoints: float | int | None = None
    weekPoints: Any | None = None
    marketValue: int | None = None
    lastSeasonPoints: int | None = None
    images: dict[str, Any] | None = None
    lastStats: list[Any] | None = None


class PlayerMarketValue(FlexibleModel):
    """One market-value history entry from ``GET /players/{id}/market-value``."""

    date: str | None = None
    marketValue: int | None = None


class LeaguePlayer(FlexibleModel):
    """Player card contextualized to a league.

    Path identifiers are master ``playerId`` values; the response may include
    the squad-entry ``playerTeamId`` alongside ownership and market blocks.
    """

    playerTeamId: str | None = None
    buyoutClause: int | None = None
    buyoutClauseLockedEndTime: str | None = None
    isShielded: bool | None = None
    managerId: int | str | None = None
    manager: dict[str, Any] | None = None
    playerMarket: dict[str, Any] | None = None
    playerMaster: dict[str, Any] | None = None
