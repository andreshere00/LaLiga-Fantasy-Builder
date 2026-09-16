"""Teams HTTP controller (thin Fantasy proxy for money and lineup)."""

from __future__ import annotations

from fastapi import APIRouter, Header, Path

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.api.payload import parse_payload
from fantasy_api.openapi import ERROR_RESPONSES
from fantasy_api.schemas.payload import as_object
from fantasy_api.schemas.teams import LineupWrite, TeamLineup, TeamMoney

router = APIRouter(tags=["teams"])


@router.get(
    "/teams/{team_id}/money",
    response_model=TeamMoney,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get team cash and investment",
)
async def get_money(
    team_id: str = Path(description="Fantasy team identifier."),
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> TeamMoney:
    """Return cash (caja) and investment for a Fantasy team.

    Rival teams often return empty or sparse payloads.

    Args:
        team_id: Fantasy team identifier.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream money JSON.
    """
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().teams_service.get_money(internal_jwt, team_id)
    return TeamMoney.model_validate(parse_payload(as_object, data))


@router.get(
    "/teams/{team_id}/lineup",
    response_model=TeamLineup,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get current team lineup",
)
async def get_lineup(
    team_id: str = Path(description="Fantasy team identifier."),
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> TeamLineup:
    """Return the current Fantasy team lineup.

    Args:
        team_id: Fantasy team identifier.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream lineup JSON.
    """
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().teams_service.get_lineup(internal_jwt, team_id)
    return TeamLineup.model_validate(parse_payload(as_object, data))


@router.get(
    "/teams/{team_id}/lineup/week/{week}",
    response_model=TeamLineup,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get team lineup for a matchweek",
)
async def get_lineup_by_week(
    team_id: str = Path(description="Fantasy team identifier."),
    week: int = Path(ge=1, description="Matchweek number."),
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> TeamLineup:
    """Return a Fantasy team lineup for a matchweek.

    Args:
        team_id: Fantasy team identifier.
        week: Matchweek number.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream lineup JSON for the requested week.
    """
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().teams_service.get_lineup_by_week(
        internal_jwt,
        team_id,
        week,
    )
    return TeamLineup.model_validate(parse_payload(as_object, data))


@router.put(
    "/teams/{team_id}/lineup",
    response_model=TeamLineup,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Replace the current team lineup",
)
async def put_lineup(
    body: LineupWrite,
    team_id: str = Path(description="Fantasy team identifier."),
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> TeamLineup:
    """Replace the current Fantasy team lineup.

    Slot identifiers are ``playerTeamId`` values from the roster, not master
    ``playerId`` values.

    Args:
        body: Lineup write payload.
        team_id: Fantasy team identifier.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream lineup JSON (may be empty on success).
    """
    _user, internal_jwt = await get_current_user(authorization)
    payload = body.model_dump(mode="json", exclude_unset=True)
    data = await get_container().teams_service.put_lineup(
        internal_jwt,
        team_id,
        payload,
    )
    return TeamLineup.model_validate(parse_payload(as_object, data))
