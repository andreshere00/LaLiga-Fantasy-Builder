"""Player catalog, market-value, and league-card schemas for OpenAPI."""

from __future__ import annotations

from fantasy_api.schemas.common import FlexibleModel
from fantasy_api.schemas.leagues import Manager, PlayerMarket, PlayerMaster


class CatalogWeekPoints(FlexibleModel):
    """Points scored in a single matchweek on the public catalog."""

    weekNumber: int | None = None
    points: int | float | None = None


class CatalogPlayer(FlexibleModel):
    """Public catalog player from ``GET /players``.

    Observed 26/27 catalog fields: status, market value, season/week points,
    and club ``teamId``. Extra Fantasy fields are preserved.
    """

    id: str | int | None = None
    nickname: str | None = None
    positionId: str | int | None = None
    playerStatus: str | None = None
    marketValue: str | int | None = None
    points: int | None = None
    averagePoints: float | int | None = None
    lastSeasonPoints: str | int | None = None
    weekPoints: list[CatalogWeekPoints] | None = None
    image: str | None = None
    teamId: str | int | None = None


class MarketValuePoint(FlexibleModel):
    """One day of market-value history from ``GET /player/{id}/market-value``."""

    lfpId: int | None = None
    marketValue: int | None = None
    date: str | None = None
    bids: int | None = None


class LeaguePlayerCard(FlexibleModel):
    """League-scoped player card from ``GET /player/{id}/league/{leagueId}``.

    Shape is unofficial and may nest ``playerMaster`` plus plantilla fields
    such as ``playerTeamId``. Unknown keys are preserved.
    """

    id: str | int | None = None
    playerTeamId: str | None = None
    buyoutClause: int | None = None
    buyoutClauseLockedEndTime: str | None = None
    isShielded: bool | None = None
    managerId: int | None = None
    manager: Manager | None = None
    playerMarket: PlayerMarket | None = None
    playerMaster: PlayerMaster | None = None
