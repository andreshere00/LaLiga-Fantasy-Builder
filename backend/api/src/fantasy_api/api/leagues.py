"""Leagues HTTP controller (thin Fantasy proxy)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Header, Path
from pydantic import BaseModel

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.openapi import ERROR_RESPONSES
from fantasy_api.schemas.leagues import (
    ActivityItem,
    FantasyLeague,
    LeaguesProbeResponse,
    LeagueTeam,
    StandingRow,
    TeamDetail,
    as_object,
    as_object_list,
    summarize_leagues_payload,
)

router = APIRouter(tags=["leagues"])


@router.get(
    "/laliga/leagues-probe",
    response_model=LeaguesProbeResponse,
    responses=ERROR_RESPONSES,
    summary="Probe Fantasy leagues connectivity",
)
async def leagues_probe(
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> LeaguesProbeResponse:
    """Verify Fantasy leagues connectivity without exposing the bearer.

    Args:
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Redacted leagues probe (count and ids only).
    """
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().leagues_service.list_leagues(internal_jwt)
    league_count, league_ids = _parse_payload(summarize_leagues_payload, data)
    return LeaguesProbeResponse(
        ok=True,
        league_count=league_count,
        league_ids=league_ids,
    )


@router.get(
    "/leagues",
    response_model=list[FantasyLeague],
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="List competition leagues",
)
async def list_leagues(
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> list[FantasyLeague]:
    """Return competition leagues from Fantasy.

    Args:
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream leagues JSON (league objects with embedded team summary).
    """
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().leagues_service.list_leagues(internal_jwt)
    return _as_model_list(data, FantasyLeague)


@router.get(
    "/leagues/{league_id}/standing",
    response_model=list[StandingRow],
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get overall league standing",
)
async def get_standing(
    league_id: str = Path(description="Fantasy league identifier."),
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> list[StandingRow]:
    """Return overall league standing.

    Args:
        league_id: Fantasy league identifier.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream standing rows (ranking / position).
    """
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().leagues_service.get_standing(internal_jwt, league_id)
    return _as_model_list(data, StandingRow)


@router.get(
    "/leagues/{league_id}/standing/{week}",
    response_model=list[StandingRow],
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get league standing for a matchweek",
)
async def get_standing_by_week(
    league_id: str = Path(description="Fantasy league identifier."),
    week: int = Path(ge=1, description="Matchweek number."),
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> list[StandingRow]:
    """Return league standing for a matchweek.

    Args:
        league_id: Fantasy league identifier.
        week: Matchweek number.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream standing rows for the requested week.
    """
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().leagues_service.get_standing_by_week(
        internal_jwt,
        league_id,
        week,
    )
    return _as_model_list(data, StandingRow)


@router.get(
    "/leagues/{league_id}/activity/{page}",
    response_model=list[ActivityItem],
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get paginated league activity",
)
async def get_activity(
    league_id: str = Path(description="Fantasy league identifier."),
    page: int = Path(ge=0, description="Activity page index (typically starts at 0)."),
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> list[ActivityItem]:
    """Return a page of league activity.

    Args:
        league_id: Fantasy league identifier.
        page: Activity page index (typically starts at ``0``).
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream activity items.
    """
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().leagues_service.get_activity(
        internal_jwt,
        league_id,
        page,
    )
    return _as_model_list(data, ActivityItem)


@router.get(
    "/leagues/{league_id}/teams",
    response_model=list[LeagueTeam],
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="List league teams and managers",
)
async def list_teams(
    league_id: str = Path(description="Fantasy league identifier."),
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> list[LeagueTeam]:
    """Return teams/managers in a league.

    Args:
        league_id: Fantasy league identifier.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream teams list.
    """
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().leagues_service.list_teams(internal_jwt, league_id)
    return _as_model_list(data, LeagueTeam)


@router.get(
    "/leagues/{league_id}/teams/{team_id}",
    response_model=TeamDetail,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get team roster and clauses",
)
async def get_team(
    league_id: str = Path(description="Fantasy league identifier."),
    team_id: str = Path(description="Fantasy team identifier."),
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> TeamDetail:
    """Return a team roster and clauses.

    Args:
        league_id: Fantasy league identifier.
        team_id: Fantasy team identifier.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream team detail including players and buyout clauses.
    """
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().leagues_service.get_team(
        internal_jwt,
        league_id,
        team_id,
    )
    return TeamDetail.model_validate(_parse_payload(as_object, data))


def _as_model_list[TModel: BaseModel](
    data: object,
    model: type[TModel],
) -> list[TModel]:
    """Coerce upstream JSON into a list of Pydantic models.

    Args:
        data: Upstream payload (list or wrapped object).
        model: Target model class.

    Returns:
        Validated model list.

    Raises:
        UpstreamError: When the payload is not a collection of objects.
    """
    return [model.model_validate(item) for item in _parse_payload(as_object_list, data)]


def _parse_payload[T](parser: Callable[[Any], T], data: object) -> T:
    """Run a payload parser and map shape errors to UpstreamError."""
    try:
        return parser(data)
    except ValueError as exc:
        raise UpstreamError(
            "fantasy payload had an unexpected shape",
            status_code=502,
            category="fantasy_error",
        ) from exc
