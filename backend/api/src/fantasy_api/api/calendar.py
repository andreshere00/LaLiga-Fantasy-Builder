"""Calendar HTTP controller (public Fantasy proxy, internal JWT gate)."""

from __future__ import annotations

from fastapi import APIRouter, Header, Path

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.api.payload import as_model_list, parse_payload
from fantasy_api.openapi import ERROR_RESPONSES
from fantasy_api.schemas.calendar import CurrentWeek, Fixture, MatchStats
from fantasy_api.schemas.payload import as_object

router = APIRouter(tags=["calendar"])


@router.get(
    "/calendar/current",
    response_model=CurrentWeek,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get current matchday",
)
async def get_current_week(
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> CurrentWeek:
    """Return current matchday and open/close dates.

    Args:
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream current week JSON.
    """
    await get_current_user(authorization)
    data = await get_container().calendar_service.get_current_week()
    return CurrentWeek.model_validate(parse_payload(as_object, data))


@router.get(
    "/calendar/weeks/{week}",
    response_model=list[Fixture],
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get fixtures for a matchday",
)
async def get_fixtures(
    week: int = Path(ge=1, description="Matchweek number."),
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> list[Fixture]:
    """Return fixtures for a matchday.

    Args:
        week: Matchweek number.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream calendar fixtures.
    """
    await get_current_user(authorization)
    data = await get_container().calendar_service.get_fixtures(week)
    return as_model_list(data, Fixture)


@router.get(
    "/calendar/weeks/{week}/stats",
    response_model=list[MatchStats],
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get matchday statistics and results",
)
async def get_week_stats(
    week: int = Path(ge=1, description="Matchweek number."),
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> list[MatchStats]:
    """Return matchday statistics and per-player week points.

    Args:
        week: Matchweek number.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream matchweek stats JSON.
    """
    await get_current_user(authorization)
    data = await get_container().calendar_service.get_week_stats(week)
    return as_model_list(data, MatchStats)
