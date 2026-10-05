"""Player stats segmented routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Path, Query, Response

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.openapi import PLAYER_STATS_ERROR_RESPONSES
from fantasy_api.schemas.player_stats import (
    FixturesQuery,
    MarketQuery,
    PlayerDetailQuery,
    PlayerDetailResponse,
    PlayerFixtureStatsResponse,
    PlayerMarketResponse,
    PlayerProfileResponse,
    PlayerStatsIndex,
    ProfileQuery,
    RecentMatchesQuery,
    RecentMatchesResponse,
    UpcomingMatchesQuery,
    UpcomingMatchesResponse,
)
from fantasy_api.security.rate_limit import get_rate_limiter

router = APIRouter(tags=["player-stats"])

PlayerIdPath = Annotated[
    str,
    Path(pattern=r"^[0-9]{1,10}$", description="Master footballer id (`CatalogPlayer.id`)."),
]


async def _enforce_rate_limit(user_id: str, response: Response) -> None:
    retry = await get_rate_limiter(
        get_container().settings.player_stats_rate_limit_per_minute,
    ).check(user_id)
    if retry is not None:
        response.headers["Retry-After"] = str(retry)
        raise UpstreamError("rate limited", status_code=429, category="rate_limited")


@router.get(
    "/players/{player_id}/stats",
    response_model=PlayerStatsIndex,
    response_model_exclude_none=False,
    responses=PLAYER_STATS_ERROR_RESPONSES,
    summary="List the stats segments available for a player",
)
async def get_stats_index(
    player_id: PlayerIdPath,
    response: Response,
    authorization: Annotated[str | None, Header()] = None,
) -> PlayerStatsIndex:
    """Return the segment catalogue for one player."""
    user, _jwt = await get_current_user(authorization)
    await _enforce_rate_limit(user.user_id, response)
    payload = await get_container().player_stats_service.index(player_id)
    response.headers["Cache-Control"] = "private, max-age=300"
    response.headers["Vary"] = "Authorization"
    return payload


@router.get(
    "/players/{player_id}/stats/detail",
    response_model=PlayerDetailResponse,
    response_model_exclude_none=False,
    responses=PLAYER_STATS_ERROR_RESPONSES,
    summary="Aggregate player stats segments in one response",
)
async def get_stats_detail(
    player_id: PlayerIdPath,
    query: Annotated[PlayerDetailQuery, Query()],
    response: Response,
    authorization: Annotated[str | None, Header()] = None,
) -> PlayerDetailResponse:
    """Return fixtures, market, matches, and profile in one payload."""
    user, _jwt = await get_current_user(authorization)
    await _enforce_rate_limit(user.user_id, response)
    payload = await get_container().player_stats_service.detail(player_id, query)
    response.headers["Cache-Control"] = "private, max-age=60"
    response.headers["Vary"] = "Authorization"
    return payload


@router.get(
    "/players/{player_id}/stats/fixtures",
    response_model=PlayerFixtureStatsResponse,
    response_model_exclude_none=False,
    responses=PLAYER_STATS_ERROR_RESPONSES,
    summary="Per-fixture statistics for a player",
)
async def get_fixture_stats(
    player_id: PlayerIdPath,
    query: Annotated[FixturesQuery, Query()],
    response: Response,
    authorization: Annotated[str | None, Header()] = None,
) -> PlayerFixtureStatsResponse:
    """Return per-fixture stats rows."""
    user, _jwt = await get_current_user(authorization)
    await _enforce_rate_limit(user.user_id, response)
    payload = await get_container().player_stats_service.fixtures(player_id, query)
    response.headers["Cache-Control"] = "private, max-age=600"
    response.headers["Vary"] = "Authorization"
    return payload


@router.get(
    "/players/{player_id}/stats/market",
    response_model=PlayerMarketResponse,
    response_model_exclude_none=False,
    responses=PLAYER_STATS_ERROR_RESPONSES,
    summary="Market-value window and preset summaries",
)
async def get_market_stats(
    player_id: PlayerIdPath,
    query: Annotated[MarketQuery, Query()],
    response: Response,
    authorization: Annotated[str | None, Header()] = None,
) -> PlayerMarketResponse:
    """Return market history window maths for a player."""
    user, _jwt = await get_current_user(authorization)
    await _enforce_rate_limit(user.user_id, response)
    payload = await get_container().player_stats_service.market(player_id, query)
    response.headers["Cache-Control"] = "private, max-age=300"
    response.headers["Vary"] = "Authorization"
    return payload


@router.get(
    "/players/{player_id}/stats/matches/recent",
    response_model=RecentMatchesResponse,
    response_model_exclude_none=False,
    responses=PLAYER_STATS_ERROR_RESPONSES,
    summary="Recent matches for a player",
)
async def get_recent_matches(
    player_id: PlayerIdPath,
    query: Annotated[RecentMatchesQuery, Query()],
    response: Response,
    authorization: Annotated[str | None, Header()] = None,
) -> RecentMatchesResponse:
    """Return recent matches with optional per-match stats."""
    user, _jwt = await get_current_user(authorization)
    await _enforce_rate_limit(user.user_id, response)
    payload = await get_container().player_stats_service.recent_matches(player_id, query)
    response.headers["Cache-Control"] = "private, max-age=600"
    response.headers["Vary"] = "Authorization"
    return payload


@router.get(
    "/players/{player_id}/stats/matches/upcoming",
    response_model=UpcomingMatchesResponse,
    response_model_exclude_none=False,
    responses=PLAYER_STATS_ERROR_RESPONSES,
    summary="Upcoming matches for a player",
)
async def get_upcoming_matches(
    player_id: PlayerIdPath,
    query: Annotated[UpcomingMatchesQuery, Query()],
    response: Response,
    authorization: Annotated[str | None, Header()] = None,
) -> UpcomingMatchesResponse:
    """Return upcoming matches with travel and weather enrichment."""
    user, _jwt = await get_current_user(authorization)
    await _enforce_rate_limit(user.user_id, response)
    payload = await get_container().player_stats_service.upcoming_matches(player_id, query)
    response.headers["Cache-Control"] = "private, max-age=900"
    response.headers["Vary"] = "Authorization"
    return payload


@router.get(
    "/players/{player_id}/stats/profile",
    response_model=PlayerProfileResponse,
    response_model_exclude_none=False,
    responses=PLAYER_STATS_ERROR_RESPONSES,
    summary="Global player profile from FutbolFantasy",
)
async def get_profile_stats(
    player_id: PlayerIdPath,
    _query: Annotated[ProfileQuery, Query()],
    response: Response,
    authorization: Annotated[str | None, Header()] = None,
) -> PlayerProfileResponse:
    """Return injury, form, and market profile fields."""
    user, _jwt = await get_current_user(authorization)
    await _enforce_rate_limit(user.user_id, response)
    payload = await get_container().player_stats_service.profile(player_id)
    response.headers["Cache-Control"] = "private, max-age=900"
    response.headers["Vary"] = "Authorization"
    return payload
