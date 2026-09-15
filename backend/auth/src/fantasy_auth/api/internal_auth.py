"""Browser token exchange and public JWKS for internal JWTs."""

from __future__ import annotations

from fastapi import APIRouter, Header, Request
from pydantic import BaseModel, Field

from fantasy_auth.api.deps import get_container, require_csrf

router = APIRouter(tags=["auth"])


class InternalTokenResponse(BaseModel):
    """Short-lived internal JWT for the Fantasy API."""

    access_token: str
    token_type: str = "Bearer"
    expires_in: int = Field(..., ge=1)
    expires_at: int = Field(..., ge=1)


@router.post("/auth/token", response_model=InternalTokenResponse)
async def exchange_session_for_token(
    request: Request,
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> InternalTokenResponse:
    """Mint an internal JWT from the authenticated browser session.

    Args:
        request: Incoming request with session cookies.
        x_csrf_token: CSRF header matching the double-submit cookie.

    Returns:
        Bearer JWT payload (not set as a cookie).
    """
    user = await require_csrf(request, x_csrf_token)
    issued = get_container().internal_tokens.issue_for_user(user)
    return InternalTokenResponse(
        access_token=issued.access_token,
        token_type=issued.token_type,
        expires_in=issued.expires_in,
        expires_at=issued.expires_at,
    )


@router.get("/.well-known/jwks.json")
async def jwks() -> dict:
    """Publish the public JWKS used to verify internal JWTs.

    Returns:
        JWKS document with RSA signing keys.
    """
    return dict(get_container().internal_tokens.public_jwks())
