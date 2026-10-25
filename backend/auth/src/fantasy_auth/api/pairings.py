"""LaLiga pairing and connection routes."""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Request
from pydantic import BaseModel

from fantasy_auth.api.deps import get_container, get_current_user
from fantasy_auth.api.schemas import (
    CompleteRedirectRequest,
    CompleteRedirectResponse,
    ConnectionStatusResponse,
    OkResponse,
    PairingCompleteRequest,
    PairingCompleteResponse,
    PairingCreateResponse,
)
from fantasy_auth.domain.errors import PairingError
from fantasy_auth.ports.repos import BrowserPairingRecord

router = APIRouter(tags=["laliga"])


@router.post("/laliga/pairings", response_model=PairingCreateResponse)
async def create_pairing(
    request: Request,
) -> PairingCreateResponse:
    """Create a one-time pairing for the authenticated app user.

    Args:
        request: Incoming request.

    Returns:
        Pairing ID, secret (shown once), expiry, and expected nonce.
    """
    user = await get_current_user(request)
    created = await get_container().pairings.create_pairing(user.user_id)
    return PairingCreateResponse(
        pairing_id=created.pairing_id,
        secret=created.secret,
        expires_at=created.expires_at,
        nonce=created.nonce,
    )


class BrowserLoginResponse(BaseModel):
    """Validated server-created authorization URL; no PKCE secrets."""

    authorize_url: str


@router.post("/laliga/login", response_model=BrowserLoginResponse)
async def laliga_login(request: Request) -> BrowserLoginResponse:
    """Start native LaLiga delegation for the verified application subject."""
    user = await get_current_user(request)
    container = get_container()
    started = await container.pairings.begin_browser_login(user.user_id)
    await container.browser_pairings.save(
        BrowserPairingRecord(
            state=started.b2c_state,
            user_id=user.user_id,
            pairing_id=started.pairing_id,
            secret=started.secret,
            code_verifier=started.code_verifier,
            expires_at=container.clock.now() + container.settings.pairing_ttl_seconds,
        ),
        now=container.clock.now(),
    )
    return BrowserLoginResponse(authorize_url=started.authorize_url)


@router.delete("/laliga/pairings", response_model=OkResponse)
async def cancel_pairings(request: Request) -> OkResponse:
    """Cancel the verified user's outstanding browser and helper challenges."""
    user = await get_current_user(request)
    container = get_container()
    await container.pairings.cancel(user.user_id)
    await container.browser_pairings.cancel(user.user_id)
    return OkResponse(ok=True)


@router.post(
    "/laliga/pairings/complete-redirect",
    response_model=CompleteRedirectResponse,
)
async def complete_redirect(
    body: CompleteRedirectRequest,
    request: Request,
) -> CompleteRedirectResponse:
    """Finish pairing from a native ``authredirect://`` callback.

    The URL handler posts the callback. Tokens stay inside auth. The response
    tells the handler which frontend origin to open.

    Args:
        body: Full native callback URL.
        request: Used for client IP rate limiting.

    Returns:
        Completion flag and frontend origin. No tokens or pairing secrets.

    Raises:
        PairingError: When the callback does not match a pending challenge.
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
    challenge = await container.browser_pairings.consume(state, now=container.clock.now())
    if challenge is None:
        raise PairingError("pairing not found or expired", category="pairing_not_found")
    await container.pairings.complete_browser_redirect(
        callback=body.callback,
        pairing_id=challenge.pairing_id,
        secret=challenge.secret,
        code_verifier=challenge.code_verifier,
        expected_state=challenge.state,
    )
    return CompleteRedirectResponse(
        ok=True,
        frontend_origin=container.settings.frontend_origin,
    )


@router.post(
    "/laliga/pairings/{pairing_id}/complete",
    response_model=PairingCompleteResponse,
)
async def complete_pairing(
    pairing_id: str,
    body: PairingCompleteRequest,
    request: Request,
) -> PairingCompleteResponse:
    """Complete pairing from the local PKCE helper (rate-limited).

    This endpoint is called by the helper CLI, not the browser, so it uses
    the pairing secret as its independent one-time proof.

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
    return PairingCompleteResponse(
        ok=True,
        user_id=result.user_id,
        manager_id=profile.user_id,
        manager_name=profile.manager_name,
        email=profile.email,
    )


@router.get("/laliga/connection", response_model=ConnectionStatusResponse)
async def get_connection(
    request: Request,
) -> ConnectionStatusResponse:
    """Return LaLiga connection status for the current user.

    Args:
        request: Incoming request.

    Returns:
        Public status without tokens.
    """
    user = await get_current_user(request)
    status = await get_container().pairings.get_status(user.user_id)
    return ConnectionStatusResponse(**status)


@router.delete("/laliga/connection", response_model=OkResponse)
async def delete_connection(
    request: Request,
) -> OkResponse:
    """Remove sealed LaLiga tokens for the current user.

    Args:
        request: Incoming request.

    Returns:
        ``{"ok": true}``.
    """
    user = await get_current_user(request)
    await get_container().pairings.unlink(user.user_id)
    await get_container().browser_pairings.cancel(user.user_id)
    return OkResponse(ok=True)


def _state_from_callback(callback: str) -> str | None:
    """Return the OAuth state query value from a native callback URL."""
    parsed = urlparse(callback)
    query = parsed.query or (callback.split("?", 1)[1] if "?" in callback else "")
    values = parse_qs(query).get("state") or []
    return values[0] if values else None
