"""Private credential endpoints for the Fantasy API service."""

from __future__ import annotations

from fastapi import APIRouter, Header, Request
from pydantic import BaseModel, Field

from fantasy_auth.api.deps import (
    require_internal_user,
    require_service_token,
    get_container,
)

router = APIRouter(tags=["internal"])


class LaligaBearerResponse(BaseModel):
    """Short-lived LaLiga bearer for Fantasy API calls."""

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
    bearer, expires_at = await get_container().credentials.get_valid_bearer(
        user.user_id
    )
    return LaligaBearerResponse(bearer_token=bearer, expires_at=expires_at)
