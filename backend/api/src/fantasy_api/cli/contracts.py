"""Pydantic contracts for endpoint responses consumed by API CLIs."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    StrictStr,
    TypeAdapter,
    ValidationError,
)

from fantasy_api.schemas.buyout import ShieldStatus
from fantasy_api.schemas.calendar import CurrentWeek, Fixture, MatchStats
from fantasy_api.schemas.common import ErrorResponse
from fantasy_api.schemas.leagues import (
    ActivityItem,
    FantasyLeague,
    LeagueTeam,
    StandingRow,
    TeamDetail,
)
from fantasy_api.schemas.market import MarketHistoryEntry, MarketSnapshot, PlayerTeamOffers
from fantasy_api.schemas.player_stats import (
    FixturesQuery,
    MarketQuery,
    PlayerDetailQuery,
    PlayerDetailResponse,
    PlayerFixtureStatsResponse,
    PlayerMarketResponse,
    PlayerProfileResponse,
    PlayerStatsIndex,
    RecentMatchesQuery,
    RecentMatchesResponse,
    UpcomingMatchesQuery,
    UpcomingMatchesResponse,
)
from fantasy_api.schemas.players import CatalogPlayer, LeaguePlayer, PlayerMarketValue
from fantasy_api.schemas.standings import CompetitionStandings, StandingsQuery
from fantasy_api.schemas.teams import TeamLineup, TeamMoney


class InternalTokenResponse(BaseModel):
    """Auth-service token response consumed by authenticated API CLIs."""

    model_config = ConfigDict(extra="forbid", strict=True)

    access_token: StrictStr
    token_type: Literal["Bearer"]
    expires_in: StrictInt = Field(ge=1)
    expires_at: StrictInt = Field(ge=1)


class AuthTokenError(BaseModel):
    """Sanitized auth-service error consumed by token-exchange CLIs."""

    model_config = ConfigDict(extra="forbid", strict=True)

    error: StrictStr
    detail: StrictStr | None = None


def _model_response(pattern: str, model: type[BaseModel]):
    return (re.compile(pattern), TypeAdapter(model), model, False)


def _list_response(pattern: str, model: type[BaseModel]):
    return (re.compile(pattern), TypeAdapter(list[model]), model, True)


_RESPONSE_ADAPTERS = (
    _model_response(r"/competitions/\d+/standings", CompetitionStandings),
    _list_response(r"/leagues", FantasyLeague),
    _list_response(r"/leagues/[^/]+/standing(?:/\d+)?", StandingRow),
    _list_response(r"/leagues/[^/]+/activity/\d+", ActivityItem),
    _list_response(r"/leagues/[^/]+/teams", LeagueTeam),
    _model_response(r"/leagues/[^/]+/teams/[^/]+", TeamDetail),
    _model_response(r"/teams/[^/]+/money", TeamMoney),
    _model_response(r"/teams/[^/]+/lineup/week/\d+", TeamLineup),
    _model_response(r"/teams/[^/]+/lineup", TeamLineup),
    _model_response(r"/calendar/current", CurrentWeek),
    _list_response(r"/calendar/weeks/\d+/stats", MatchStats),
    _list_response(r"/calendar/weeks/\d+", Fixture),
    _list_response(r"/players", CatalogPlayer),
    _list_response(r"/players/[^/]+/market-value", PlayerMarketValue),
    _model_response(r"/players/[^/]+/league/[^/]+", LeaguePlayer),
    _model_response(r"/players/[^/]+/stats/detail", PlayerDetailResponse),
    _model_response(r"/players/[^/]+/stats/fixtures", PlayerFixtureStatsResponse),
    _model_response(r"/players/[^/]+/stats/market", PlayerMarketResponse),
    _model_response(r"/players/[^/]+/stats/matches/recent", RecentMatchesResponse),
    _model_response(r"/players/[^/]+/stats/matches/upcoming", UpcomingMatchesResponse),
    _model_response(r"/players/[^/]+/stats/profile", PlayerProfileResponse),
    _model_response(r"/players/[^/]+/stats", PlayerStatsIndex),
    _list_response(r"/market/leagues/[^/]+/history", MarketHistoryEntry),
    _model_response(r"/market/leagues/[^/]+/player-teams/[^/]+/offers", PlayerTeamOffers),
    _model_response(r"/market/leagues/[^/]+", MarketSnapshot),
    _model_response(r"/buyout/leagues/[^/]+/player-teams/[^/]+/shield", ShieldStatus),
)

_QUERY_ADAPTERS: tuple[tuple[re.Pattern[str], TypeAdapter], ...] = (
    (re.compile(r"/competitions/\d+/standings"), TypeAdapter(StandingsQuery)),
    (re.compile(r"/players/[^/]+/stats/detail"), TypeAdapter(PlayerDetailQuery)),
    (re.compile(r"/players/[^/]+/stats/fixtures"), TypeAdapter(FixturesQuery)),
    (re.compile(r"/players/[^/]+/stats/market"), TypeAdapter(MarketQuery)),
    (re.compile(r"/players/[^/]+/stats/matches/recent"), TypeAdapter(RecentMatchesQuery)),
    (re.compile(r"/players/[^/]+/stats/matches/upcoming"), TypeAdapter(UpcomingMatchesQuery)),
)


def response_adapter(path: str) -> TypeAdapter:
    """Return the Pydantic response adapter for a CLI-supported GET path."""
    for pattern, adapter, _model, _is_list in _RESPONSE_ADAPTERS:
        if pattern.fullmatch(path):
            return adapter
    raise ValueError("no response schema is registered for this API path")


def validate_response(path: str, value: object) -> object:
    """Validate a CLI response and reject objects with no declared fields."""
    for pattern, adapter, model, is_list in _RESPONSE_ADAPTERS:
        if not pattern.fullmatch(path):
            continue
        rows = value if is_list and isinstance(value, list) else [value]
        known_keys = set(model.model_fields)
        for field in model.model_fields.values():
            for alias in (field.alias, field.serialization_alias):
                if isinstance(alias, str):
                    known_keys.add(alias)
        for row in rows:
            if not isinstance(row, dict):
                continue
            if not row and getattr(model, "empty_payload_allowed", False):
                continue
            if not known_keys.intersection(row):
                raise ValueError("API response had no recognized fields")
        return adapter.validate_python(value)
    raise ValueError("no response schema is registered for this API path")


def query_adapter(path: str) -> TypeAdapter | None:
    """Return the optional Pydantic query adapter for a CLI-supported GET path."""
    for pattern, adapter in _QUERY_ADAPTERS:
        if pattern.fullmatch(path):
            return adapter
    return None


def dump_validated_response(value: object) -> object:
    """Convert a validated Pydantic response to its original JSON wire keys."""
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json", by_alias=True, exclude_unset=True)
    if isinstance(value, list):
        return [dump_validated_response(item) for item in value]
    return value


def safe_error_body(value: object) -> dict[str, str]:
    """Return a validated API error or an empty object for an unknown variant."""
    try:
        error = ErrorResponse.model_validate(value)
    except (ValidationError, TypeError):
        return {}
    return error.model_dump(mode="json")
