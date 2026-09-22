"""Buyout clause and shielding HTTP controller (thin Fantasy proxy)."""

from __future__ import annotations

from fastapi import APIRouter, Header, Path

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.api.payload import parse_payload
from fantasy_api.openapi import ERROR_RESPONSES
from fantasy_api.schemas.buyout import (
    BuyoutMutationResult,
    IncreaseBuyoutWrite,
    PayBuyoutWrite,
    ShieldStatus,
    ShieldWrite,
)
from fantasy_api.schemas.payload import as_object

router = APIRouter(prefix="/buyout", tags=["buyout"])

_AUTH_HEADER = Header(
    default=None,
    description="Bearer internal JWT issued by auth ``POST /auth/token``.",
)


@router.get(
    "/leagues/{league_id}/player-teams/{player_team_id}/shield",
    response_model=ShieldStatus,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Check shield status for a squad entry",
)
async def check_shield(
    league_id: str = Path(description="Fantasy league identifier."),
    player_team_id: str = Path(
        description="Squad-entry id (``playerTeamId``), not master ``playerId``.",
    ),
    authorization: str | None = _AUTH_HEADER,
) -> ShieldStatus:
    """Return shield status for a squad entry."""
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().buyout_service.check_shield(
        internal_jwt,
        league_id,
        player_team_id,
    )
    return ShieldStatus.model_validate(parse_payload(as_object, data))


@router.post(
    "/leagues/{league_id}/player-teams/{player_team_id}/pay",
    response_model=BuyoutMutationResult,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Pay a buyout clause",
)
async def pay_buyout(
    body: PayBuyoutWrite,
    league_id: str = Path(description="Fantasy league identifier."),
    player_team_id: str = Path(
        description="Squad-entry id (``playerTeamId``), not master ``playerId``.",
    ),
    authorization: str | None = _AUTH_HEADER,
) -> BuyoutMutationResult:
    """Pay the buyout clause for a squad entry."""
    _user, internal_jwt = await get_current_user(authorization)
    payload = body.model_dump(mode="json")
    data = await get_container().buyout_service.pay_buyout(
        internal_jwt,
        league_id,
        player_team_id,
        payload,
    )
    return BuyoutMutationResult.model_validate(parse_payload(as_object, data))


@router.post(
    "/leagues/{league_id}/player-teams/{player_team_id}/increase",
    response_model=BuyoutMutationResult,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Set or increase a buyout clause",
)
async def increase_buyout(
    body: IncreaseBuyoutWrite,
    league_id: str = Path(description="Fantasy league identifier."),
    player_team_id: str = Path(
        description="Squad-entry id (``playerTeamId``), not master ``playerId``.",
    ),
    authorization: str | None = _AUTH_HEADER,
) -> BuyoutMutationResult:
    """Set or increase the buyout clause for a squad entry."""
    _user, internal_jwt = await get_current_user(authorization)
    payload = body.model_dump(mode="json")
    data = await get_container().buyout_service.increase_buyout(
        internal_jwt,
        league_id,
        player_team_id,
        payload,
    )
    return BuyoutMutationResult.model_validate(parse_payload(as_object, data))


@router.put(
    "/leagues/{league_id}/shield",
    response_model=BuyoutMutationResult,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Activate shielding for a squad entry",
)
async def activate_shield(
    body: ShieldWrite,
    league_id: str = Path(description="Fantasy league identifier."),
    authorization: str | None = _AUTH_HEADER,
) -> BuyoutMutationResult:
    """Activate shielding for a squad entry.

    ``playerId`` in the body is the squad-entry id (``playerTeamId``).
    """
    _user, internal_jwt = await get_current_user(authorization)
    payload = body.model_dump(mode="json")
    data = await get_container().buyout_service.activate_shield(
        internal_jwt,
        league_id,
        payload,
    )
    return BuyoutMutationResult.model_validate(parse_payload(as_object, data))
