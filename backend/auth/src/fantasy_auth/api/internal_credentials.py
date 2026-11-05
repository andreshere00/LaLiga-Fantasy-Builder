"""Private credential endpoints for the Fantasy API service."""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Header, Request
from pydantic import BaseModel, ConfigDict, Field

from fantasy_auth.api.deps import (
    get_container,
    require_internal_user,
    require_service_token,
)
from fantasy_auth.domain.errors import SessionError

router = APIRouter(tags=["internal"])


class LaligaBearerResponse(BaseModel):
    """Short-lived LaLiga bearer for Fantasy API calls."""

    model_config = ConfigDict(extra="forbid")

    bearer_token: str
    token_type: str = "Bearer"
    expires_at: int = Field(..., ge=1)


@router.get("/internal/laliga/bearer", response_model=LaligaBearerResponse)
async def get_laliga_bearer(
    request: Request,
    authorization: str | None = Header(default=None),
    x_service_token: str | None = Header(default=None, alias="X-Service-Token"),
) -> LaligaBearerResponse:
    """Return a valid LaLiga bearer for the JWT subject.

    Requires both a valid internal JWT and the shared service token.
    The user id is taken only from the JWT ``sub`` claim.

    Args:
        request: Incoming request (unused; kept for ASGI consistency).
        authorization: ``Bearer <internal JWT>``.
        x_service_token: Shared service credential.

    Returns:
        LaLiga bearer and expiry (no refresh token).
    """
    del request
    require_service_token(x_service_token)
    user = await require_internal_user(authorization)
    bearer, expires_at = await get_container().credentials.get_valid_bearer(user.user_id)
    return LaligaBearerResponse(bearer_token=bearer, expires_at=expires_at)


class ScoutingGrantResponse(BaseModel):
    """Opaque revocable delegation, never a LaLiga or application JWT."""

    grant_id: str


class ScoutingRedemption(BaseModel):
    """Worker possession plus a private service credential authorizes redemption."""

    model_config = ConfigDict(extra="forbid")
    grant_id: str = Field(min_length=32, max_length=128)
    retry_unauthorized: bool = Field(default=False, strict=True)


@router.put("/internal/scouting/leagues/{league_id}/grant", response_model=ScoutingGrantResponse)
async def create_scouting_grant(
    league_id: str,
    authorization: str | None = Header(default=None),
    x_service_token: str | None = Header(default=None, alias="X-Service-Token"),
) -> ScoutingGrantResponse:
    """Delegate background reads for the verified subject and requested league."""
    require_service_token(x_service_token)
    user = await require_internal_user(authorization)
    grants = get_container().scouting_grants
    assert grants is not None
    lock = get_container().refresh_lock
    if not await lock.acquire(user.user_id):
        raise SessionError("connection operation in progress")
    try:
        return ScoutingGrantResponse(grant_id=await grants.create(user.user_id, league_id))
    finally:
        await lock.release(user.user_id)


@router.delete("/internal/scouting/leagues/{league_id}/grant")
async def revoke_scouting_grant(
    league_id: str,
    authorization: str | None = Header(default=None),
    x_service_token: str | None = Header(default=None, alias="X-Service-Token"),
) -> dict[str, bool]:
    """Revoke the verified subject's delegation."""
    require_service_token(x_service_token)
    user = await require_internal_user(authorization)
    grants = get_container().scouting_grants
    assert grants is not None
    await grants.revoke(user.user_id, league_id)
    return {"ok": True}


@router.post("/internal/scouting/leagues/{league_id}/bearer", response_model=LaligaBearerResponse)
async def redeem_scouting_grant(
    league_id: str,
    body: ScoutingRedemption,
    x_service_token: str | None = Header(default=None, alias="X-Service-Token"),
) -> LaligaBearerResponse:
    """Redeem an explicit grant; owner is resolved from Auth storage only."""
    container = get_container()
    expected = container.settings.scouting_service_token
    if not expected or not x_service_token or not secrets.compare_digest(x_service_token, expected):
        raise SessionError("invalid scouting service credential")
    assert container.scouting_grants is not None
    owner = await container.scouting_grants.resolve(body.grant_id, league_id)
    if body.retry_unauthorized:
        await container.credentials.retry_after_unauthorized(owner)
    bearer, expires = await container.credentials.get_valid_bearer(owner)
    await container.scouting_grants.resolve(body.grant_id, league_id)
    return LaligaBearerResponse(bearer_token=bearer, expires_at=expires)
