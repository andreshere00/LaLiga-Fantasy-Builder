"""Calendar and matchday upstream response schemas for OpenAPI / Swagger."""

from __future__ import annotations

from typing import Any

from fantasy_api.schemas.common import FlexibleModel


class CurrentWeek(FlexibleModel):
    """Current matchday metadata from Fantasy."""

    isLive: bool | None = None
    nextWeek: int | None = None
    previousWeek: int | None = None
    weekNumber: int | None = None
    openingWeekDate: str | None = None
    closingWeekDate: str | None = None


class Fixture(FlexibleModel):
    """Single fixture in a matchday calendar."""

    id: str | None = None
    matchDate: str | None = None
    date: str | None = None
    time: str | None = None
    localId: int | None = None
    visitorId: int | None = None
    matchState: int | None = None
    localScore: int | None = None
    visitorScore: int | None = None
    featured: bool | None = None


class MatchPlayer(FlexibleModel):
    """Player row embedded in matchweek stats."""

    id: int | None = None
    images: dict[str, Any] | None = None
    name: str | None = None
    nickname: str | None = None
    positionId: int | None = None
    teamId: int | None = None
    weekPoints: int | None = None


class MatchSide(FlexibleModel):
    """Home or away side in matchweek stats."""

    id: int | None = None
    badgeColor: str | None = None
    mainName: str | None = None
    players: list[MatchPlayer] | None = None


class MatchStats(FlexibleModel):
    """Single match with per-player week points."""

    id: int | None = None
    date: str | None = None
    local: MatchSide | None = None
    visitor: MatchSide | None = None
    matchState: int | None = None
    localScore: int | None = None
    visitorScore: int | None = None
