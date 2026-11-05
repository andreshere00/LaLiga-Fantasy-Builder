"""Authenticated application favorites and scouting inbox endpoints."""

from fastapi import APIRouter, Header, Query

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.openapi import ERROR_RESPONSES
from fantasy_api.schemas.scouting import (
    FavoritesImport,
    FavoritesResponse,
    Identifier,
    InboxResponse,
    PlayerId,
    ScoutingResult,
    WatchWrite,
)
from fantasy_api.services.scouting import ScoutingService

router = APIRouter(prefix="/scouting", tags=["scouting"], responses=ERROR_RESPONSES)


def _service() -> ScoutingService:
    """Return the wired domain without silently substituting volatile storage."""
    service = get_container().scouting_service
    if service is None:
        raise UpstreamError("scouting unavailable", status_code=503)
    return service


@router.get("/favorites", response_model=FavoritesResponse)
async def favorites(
    league_id: Identifier | None = None,
    authorization: str | None = Header(default=None),
) -> FavoritesResponse:
    """List global favorites contextualized to the requested league."""
    user, _ = await get_current_user(authorization)
    return await _service().favorites(user.user_id, league_id)


@router.post("/favorites/import", response_model=ScoutingResult)
async def import_favorites(
    body: FavoritesImport,
    authorization: str | None = Header(default=None),
) -> ScoutingResult:
    """Union legacy favorites without enabling alerts or replacing preferences."""
    user, _ = await get_current_user(authorization)
    await _service().add(user.user_id, body.player_ids)
    return ScoutingResult()


@router.put("/favorites/{player_id}", response_model=ScoutingResult)
async def add_favorite(
    player_id: PlayerId,
    authorization: str | None = Header(default=None),
) -> ScoutingResult:
    """Save a master player idempotently; alert activation is a separate write."""
    user, _ = await get_current_user(authorization)
    await _service().add(user.user_id, [player_id])
    return ScoutingResult()


@router.delete("/favorites/{player_id}", response_model=ScoutingResult)
async def remove_favorite(
    player_id: PlayerId,
    authorization: str | None = Header(default=None),
) -> ScoutingResult:
    """Remove a favorite and all watches, retaining historical notifications."""
    user, jwt = await get_current_user(authorization)
    await _service().remove(user.user_id, jwt, player_id)
    return ScoutingResult()


@router.put("/leagues/{league_id}/watches/{player_id}", response_model=ScoutingResult)
async def set_watch(
    league_id: Identifier,
    player_id: PlayerId,
    body: WatchWrite,
    authorization: str | None = Header(default=None),
) -> ScoutingResult:
    """Replace league-specific alert preferences after membership verification."""
    user, jwt = await get_current_user(authorization)
    await _service().watch(user.user_id, jwt, league_id, player_id, body)
    return ScoutingResult()


@router.post("/leagues/{league_id}/refresh", response_model=ScoutingResult)
async def refresh(
    league_id: Identifier,
    authorization: str | None = Header(default=None),
) -> ScoutingResult:
    """Revalidate and resume watches; performs only read operations in Fantasy."""
    user, jwt = await get_current_user(authorization)
    await _service().refresh(user.user_id, jwt, league_id)
    return ScoutingResult()


@router.get("/notifications", response_model=InboxResponse)
async def notifications(
    league_id: Identifier | None = None,
    cursor: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    authorization: str | None = Header(default=None),
) -> InboxResponse:
    """Page persistent alerts; opening the inbox does not mark them read."""
    user, _ = await get_current_user(authorization)
    return await _service().inbox(user.user_id, league_id, cursor, limit)


@router.put("/notifications/{notification_id}/read", response_model=ScoutingResult)
async def mark_read(
    notification_id: int,
    authorization: str | None = Header(default=None),
) -> ScoutingResult:
    """Mark one owned event read, idempotently; foreign identifiers return 404."""
    user, _ = await get_current_user(authorization)
    await _service().read(user.user_id, notification_id)
    return ScoutingResult()


@router.delete("/account", response_model=ScoutingResult)
async def delete_account(authorization: str | None = Header(default=None)) -> ScoutingResult:
    """Delete application scouting records for account removal."""
    user, jwt = await get_current_user(authorization)
    await _service().delete_account(user.user_id, jwt)
    return ScoutingResult()
