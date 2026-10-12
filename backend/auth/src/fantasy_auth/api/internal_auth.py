"""Browser token exchange and public JWKS for internal JWTs."""

from __future__ import annotations

from fastapi import APIRouter, Header, Request

from fantasy_auth.api.deps import get_container, require_csrf
from fantasy_auth.api.schemas import InternalTokenResponse, JwksResponse

router = APIRouter(tags=["auth"])


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


@router.get("/.well-known/jwks.json", response_model=JwksResponse)
async def jwks() -> JwksResponse:
    """Publish the public JWKS used to verify internal JWTs.

    Returns:
        JWKS document with RSA signing keys.
    """
    return JwksResponse.model_validate(dict(get_container().internal_tokens.public_jwks()))
