"""Calendar and matchday upstream response schemas for OpenAPI / Swagger."""

from __future__ import annotations

from fantasy_api.schemas.common import FantasyWireModel, JsonObject


class CurrentWeek(FantasyWireModel):
    """Current matchday metadata from Fantasy."""

    is_live: bool | None = None
    next_week: int | None = None
    previous_week: int | None = None
    week_number: int | None = None
    opening_week_date: str | None = None
    closing_week_date: str | None = None


class Fixture(FantasyWireModel):
    """Single fixture in a matchday calendar."""

    id: str | None = None
    match_date: str | None = None
    date: str | None = None
    time: str | None = None
    local_id: int | None = None
    visitor_id: int | None = None
    match_state: int | None = None
    local_score: int | None = None
    visitor_score: int | None = None
    featured: bool | None = None


class MatchPlayer(FantasyWireModel):
    """Player row embedded in matchweek stats."""

    id: int | None = None
    images: JsonObject | None = None
    name: str | None = None
    nickname: str | None = None
    position_id: int | None = None
    team_id: int | None = None
    week_points: int | None = None


class MatchSide(FantasyWireModel):
    """Home or away side in matchweek stats."""

    id: int | None = None
    badge_color: str | None = None
    main_name: str | None = None
    players: list[MatchPlayer] | None = None


class MatchStats(FantasyWireModel):
    """Single match with per-player week points."""

    id: int | None = None
    date: str | None = None
    local: MatchSide | None = None
    visitor: MatchSide | None = None
    match_state: int | None = None
    local_score: int | None = None
    visitor_score: int | None = None
