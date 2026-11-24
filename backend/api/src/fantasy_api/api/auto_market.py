"""Authenticated endpoints that arm, change and cancel automatic market rules."""

from fastapi import APIRouter, Header, Query

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.openapi import ERROR_RESPONSES
from fantasy_api.schemas.auto_market import (
    AutoExecutionsResponse,
    AutoMarketResult,
    AutoRulesResponse,
    AutoRuleWrite,
)
from fantasy_api.schemas.common import ErrorResponse
from fantasy_api.schemas.scouting import Identifier
from fantasy_api.services.auto_market import AutoMarketService

router = APIRouter(
    prefix="/auto-market",
    tags=["auto-market"],
    responses={
        **ERROR_RESPONSES,
        404: {"description": "League, player or live rule not found.", "model": ErrorResponse},
        409: {"description": "A live rule already exists for the player.", "model": ErrorResponse},
    },
)


def _service() -> AutoMarketService:
    """Return the wired domain without silently substituting volatile storage."""
    service = get_container().auto_market_service
    if service is None:
        raise UpstreamError("auto-market unavailable", status_code=503)
    return service


@router.get("/leagues/{league_id}/rules", response_model=AutoRulesResponse)
async def list_rules(
    league_id: Identifier,
    authorization: str | None = Header(default=None),
) -> AutoRulesResponse:
    """List the caller's rules for a league, newest first, with worker health."""
    user, _ = await get_current_user(authorization)
    return await _service().rules(user.user_id, league_id)


@router.post("/leagues/{league_id}/rules", response_model=AutoMarketResult, status_code=201)
async def arm_rule(
    league_id: Identifier,
    body: AutoRuleWrite,
    authorization: str | None = Header(default=None),
) -> AutoMarketResult:
    """Arm a rule. This request is the user's confirmation that it may run unattended."""
    user, jwt = await get_current_user(authorization)
    await _service().arm(user.user_id, jwt, league_id, body)
    return AutoMarketResult()


@router.put("/leagues/{league_id}/rules/{rule_id}", response_model=AutoMarketResult)
async def replace_rule(
    league_id: Identifier,
    rule_id: int,
    body: AutoRuleWrite,
    authorization: str | None = Header(default=None),
) -> AutoMarketResult:
    """Replace an armed rule and re-baseline it from the current market value."""
    user, jwt = await get_current_user(authorization)
    await _service().update(user.user_id, jwt, league_id, rule_id, body)
    return AutoMarketResult()


@router.delete("/leagues/{league_id}/rules/{rule_id}", response_model=AutoMarketResult)
async def cancel_rule(
    league_id: Identifier,
    rule_id: int,
    authorization: str | None = Header(default=None),
) -> AutoMarketResult:
    """Cancel an armed or listed rule; the write delegation ends with the last live rule."""
    user, jwt = await get_current_user(authorization)
    await _service().cancel(user.user_id, jwt, league_id, rule_id)
    return AutoMarketResult()


@router.get("/leagues/{league_id}/executions", response_model=AutoExecutionsResponse)
async def list_executions(
    league_id: Identifier,
    limit: int = Query(default=50, ge=1, le=100),
    authorization: str | None = Header(default=None),
) -> AutoExecutionsResponse:
    """List the newest attempted market writes for a league."""
    user, _ = await get_current_user(authorization)
    return await _service().executions(user.user_id, league_id, limit)


@router.delete("/account", response_model=AutoMarketResult)
async def delete_account(authorization: str | None = Header(default=None)) -> AutoMarketResult:
    """Delete automatic-market records and revoke every write delegation."""
    user, jwt = await get_current_user(authorization)
    await _service().delete_account(user.user_id, jwt)
    return AutoMarketResult()
