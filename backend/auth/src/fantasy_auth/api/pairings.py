"""LaLiga pairing and connection routes."""

from __future__ import annotations

from dataclasses import replace
from typing import Any
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Header, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from fantasy_auth.api.deps import get_container, get_current_user, require_csrf
from fantasy_auth.domain.errors import PairingError, SessionError

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


class CompleteRedirectRequest(BaseModel):
    """Native callback captured by the local URL handler."""

    callback: str = Field(..., min_length=8)


@router.get("/laliga/login")
async def laliga_login(request: Request) -> RedirectResponse:
    """Redirect an authenticated browser to LaLiga, or home if already linked.

    Args:
        request: Incoming request. Reads the session cookie.

    Returns:
        Redirect to B2C or the frontend origin.

    Raises:
        SessionError: When the caller has no application session.
    """
    container = get_container()
    session_id = request.cookies.get(container.settings.cookie_name)
    if not session_id:
        raise SessionError("missing session")
    return RedirectResponse(url=await browser_landing_url(session_id), status_code=302)


@router.post("/laliga/pairings/complete-redirect")
async def complete_redirect(
    body: CompleteRedirectRequest,
    request: Request,
) -> dict[str, Any]:
    """Finish pairing from a native ``authredirect://`` callback.

    The URL handler posts the callback. Tokens stay inside auth. The response
    tells the handler which frontend origin to open.

    Args:
        body: Full native callback URL.
        request: Used for client IP rate limiting.

    Returns:
        Completion flag and frontend origin. No tokens or pairing secrets.

    Raises:
        PairingError: When the callback does not match a pending session.
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
    state = _state_from_callback(body.callback)
    if not state:
        raise PairingError("callback missing state", category="pairing_callback")
    session = await container.session_store.find_by_laliga_state(state)
    if (
        session is None
        or not session.laliga_pairing_id
        or not session.laliga_pairing_secret
        or not session.laliga_code_verifier
        or not session.laliga_b2c_state
    ):
        raise PairingError("pairing not found", category="pairing_not_found")
    await container.pairings.complete_browser_redirect(
        callback=body.callback,
        pairing_id=session.laliga_pairing_id,
        secret=session.laliga_pairing_secret,
        code_verifier=session.laliga_code_verifier,
        expected_state=session.laliga_b2c_state,
    )
    await container.session_store.save(
        replace(
            session,
            laliga_pairing_id=None,
            laliga_pairing_secret=None,
            laliga_code_verifier=None,
            laliga_b2c_state=None,
        )
    )
    return {"ok": True, "frontend_origin": container.settings.frontend_origin}


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


async def browser_landing_url(session_id: str) -> str:
    """Return the frontend when LaLiga is linked, otherwise the B2C URL.

    Args:
        session_id: Application session id.

    Returns:
        Absolute URL for the next browser hop.
    """
    container = get_container()
    session = await container.session_store.get(session_id)
    if session is None or session.user is None:
        return container.settings.frontend_origin
    status = await container.pairings.get_status(session.user.user_id)
    if status["linked"] and not status["needs_reauth"]:
        return container.settings.frontend_origin
    started = await container.pairings.begin_browser_login(session.user.user_id)
    await container.session_store.save(
        replace(
            session,
            laliga_pairing_id=started.pairing_id,
            laliga_pairing_secret=started.secret,
            laliga_code_verifier=started.code_verifier,
            laliga_b2c_state=started.b2c_state,
        )
    )
    return started.authorize_url


def _state_from_callback(callback: str) -> str | None:
    """Return the OAuth state query value from a native callback URL."""
    parsed = urlparse(callback)
    query = parsed.query or (callback.split("?", 1)[1] if "?" in callback else "")
    values = parse_qs(query).get("state") or []
    return values[0] if values else None
