"""LaLiga pairing and connection routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, Request
from pydantic import BaseModel, Field

from fantasy_auth.api.deps import get_container, require_csrf
from fantasy_auth.domain.errors import PairingError

router = APIRouter(tags=["laliga"])


class PairingCreateResponse(BaseModel):
    """One-time pairing credentials for the local helper."""

    pairing_id: str
    secret: str
    expires_at: int
    nonce: str


class PairingCompleteRequest(BaseModel):
    """Helper-submitted token payload to finish pairing."""

    secret: str = Field(..., min_length=8)
    token_response: dict[str, Any]


class ConnectionStatusResponse(BaseModel):
    """Public LaLiga connection status (no secrets)."""

    linked: bool
    needs_reauth: bool = False
    manager_id: str | None = None
    manager_name: str | None = None


@router.post("/laliga/pairings", response_model=PairingCreateResponse)
async def create_pairing(
    request: Request,
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> PairingCreateResponse:
    """Create a one-time pairing for the authenticated app user.

    Args:
        request: Incoming request.
        x_csrf_token: CSRF header.

    Returns:
        Pairing ID, secret (shown once), expiry, and expected nonce.
    """
    user = await require_csrf(request, x_csrf_token)
    created = await get_container().pairings.create_pairing(user.user_id)
    return PairingCreateResponse(
        pairing_id=created.pairing_id,
        secret=created.secret,
        expires_at=created.expires_at,
        nonce=created.nonce,
    )


@router.post("/laliga/pairings/{pairing_id}/complete")
async def complete_pairing(
    pairing_id: str,
    body: PairingCompleteRequest,
    request: Request,
) -> dict[str, Any]:
    """Complete pairing from the local PKCE helper (rate-limited).

    This endpoint is called by the helper CLI, not the browser, so it uses
    the pairing secret instead of the session CSRF cookie.

    Args:
        pairing_id: Public pairing identifier.
        body: Secret + raw B2C token response.
        request: Used for client IP rate limiting.

    Returns:
        Completion status with manager profile fields (no tokens).
    """
    container = get_container()
    client_ip = request.client.host if request.client else "unknown"
    allowed = await container.rate_limiter.allow(
        f"pairing-complete:{client_ip}",
        limit=container.settings.pairing_rate_limit_per_minute,
        window_seconds=60,
    )
    if not allowed:
        raise PairingError("rate limited", category="rate_limited")

    result = await container.pairings.complete_pairing(
        pairing_id=pairing_id,
        secret=body.secret,
        token_response=body.token_response,
    )
    profile = result.profile
    return {
        "ok": True,
        "user_id": result.user_id,
        "manager_id": profile.user_id,
        "manager_name": profile.manager_name,
        "email": profile.email,
    }


@router.get("/laliga/connection", response_model=ConnectionStatusResponse)
async def get_connection(
    request: Request,
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> ConnectionStatusResponse:
    """Return LaLiga connection status for the current user.

    Args:
        request: Incoming request.
        x_csrf_token: CSRF header (safe read still requires session).

    Returns:
        Public status without tokens.
    """
    # GET uses session auth; CSRF optional for safe methods but we still
    # require a valid session via require_csrf's user path — use get_current.
    from fantasy_auth.api.deps import get_current_user

    del x_csrf_token
    user, _session = await get_current_user(request)
    status = await get_container().pairings.get_status(user.user_id)
    return ConnectionStatusResponse(**status)


@router.delete("/laliga/connection")
async def delete_connection(
    request: Request,
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> dict[str, bool]:
    """Remove sealed LaLiga tokens for the current user.

    Args:
        request: Incoming request.
        x_csrf_token: CSRF header.

    Returns:
        ``{"ok": true}``.
    """
    user = await require_csrf(request, x_csrf_token)
    await get_container().pairings.unlink(user.user_id)
    return {"ok": True}
