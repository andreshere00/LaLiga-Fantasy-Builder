"""Leagues HTTP controller (thin Fantasy proxy)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.schemas.leagues import LeaguesProbeResponse, summarize_leagues_payload

router = APIRouter(tags=["leagues"])


@router.get("/laliga/leagues-probe", response_model=LeaguesProbeResponse)
async def leagues_probe(
    authorization: str | None = Header(default=None),
) -> LeaguesProbeResponse:
    """Verify Fantasy leagues connectivity without exposing the bearer.

    Args:
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Redacted leagues probe (count and ids only).
    """
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().leagues_service.list_leagues(internal_jwt)
    league_count, league_ids = summarize_leagues_payload(data)
    return LeaguesProbeResponse(
        ok=True,
        league_count=league_count,
        league_ids=league_ids,
    )


@router.get("/leagues")
async def list_leagues(
    authorization: str | None = Header(default=None),
) -> Any:
    """Return competition leagues from Fantasy.

    Args:
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream leagues JSON.
    """
    _user, internal_jwt = await get_current_user(authorization)
    return await get_container().leagues_service.list_leagues(internal_jwt)


@router.get("/leagues/{league_id}/standing")
async def get_standing(
    league_id: str,
    authorization: str | None = Header(default=None),
) -> Any:
    """Return overall league standing.

    Args:
        league_id: Fantasy league identifier.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream standing JSON.
    """
    _user, internal_jwt = await get_current_user(authorization)
    return await get_container().leagues_service.get_standing(internal_jwt, league_id)


@router.get("/leagues/{league_id}/standing/{week}")
async def get_standing_by_week(
    league_id: str,
    week: int,
    authorization: str | None = Header(default=None),
) -> Any:
    """Return league standing for a matchweek.

    Args:
        league_id: Fantasy league identifier.
        week: Matchweek number.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream standing JSON.
    """
    _user, internal_jwt = await get_current_user(authorization)
    return await get_container().leagues_service.get_standing_by_week(
        internal_jwt,
        league_id,
        week,
    )


@router.get("/leagues/{league_id}/activity/{page}")
async def get_activity(
    league_id: str,
    page: int,
    authorization: str | None = Header(default=None),
) -> Any:
    """Return a page of league activity.

    Args:
        league_id: Fantasy league identifier.
        page: Activity page index (typically starts at ``0``).
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream activity JSON.
    """
    _user, internal_jwt = await get_current_user(authorization)
    return await get_container().leagues_service.get_activity(
        internal_jwt,
        league_id,
        page,
    )


@router.get("/leagues/{league_id}/teams")
async def list_teams(
    league_id: str,
    authorization: str | None = Header(default=None),
) -> Any:
    """Return teams/managers in a league.

    Args:
        league_id: Fantasy league identifier.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream teams JSON.
    """
    _user, internal_jwt = await get_current_user(authorization)
    return await get_container().leagues_service.list_teams(internal_jwt, league_id)


@router.get("/leagues/{league_id}/teams/{team_id}")
async def get_team(
    league_id: str,
    team_id: str,
    authorization: str | None = Header(default=None),
) -> Any:
    """Return a team roster and clauses.

    Args:
        league_id: Fantasy league identifier.
        team_id: Fantasy team identifier.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream team JSON.
    """
    _user, internal_jwt = await get_current_user(authorization)
    return await get_container().leagues_service.get_team(
        internal_jwt,
        league_id,
        team_id,
    )
