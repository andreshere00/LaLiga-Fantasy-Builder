"""LaLiga pairing and connection routes."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, parse_qsl, urlparse

from fastapi import APIRouter, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from fantasy_auth.adapters.pkce import generate_pairing_secret, hash_secret
from fantasy_auth.api.deps import get_container, get_current_user
from fantasy_auth.api.schemas import (
    AuthErrorResponse,
    CompleteRedirectRequest,
    CompleteRedirectResponse,
    ConnectionStatusResponse,
    LinkOptionsResponse,
    ManualCompleteRequest,
    ManualStartResponse,
    OkResponse,
    PairingCompleteRequest,
    PairingCompleteResponse,
    PairingCreateResponse,
)
from fantasy_auth.domain.errors import AuthError, PairingError
from fantasy_auth.ports.repos import BrowserPairingRecord

router = APIRouter(tags=["laliga"])

BINDING_COOKIE = "lfb_laliga_bind"
CALLBACK_PATH = "/laliga/callback"
MANUAL_COOKIE = "lfb_laliga_manual"
MANUAL_PATH = "/laliga/manual"
NATIVE_REDIRECT = "authredirect://com.lfp.laligafantasy"


@router.get("/laliga/link-options", response_model=LinkOptionsResponse)
async def link_options(request: Request) -> LinkOptionsResponse:
    """Describe enabled linking journeys to a verified application user."""
    user = await get_current_user(request)
    settings = get_container().settings
    return LinkOptionsResponse(
        browser_available=settings.laliga_browser_redirect_uri is not None,
        manual_available=(
            settings.laliga_manual_link_enabled and settings.laliga_redirect_uri == NATIVE_REDIRECT
        ),
        helper_available=settings.laliga_helper_enabled,
        helper_platforms=["macos"] if settings.laliga_helper_enabled else [],
        user_id=user.user_id,
        email=user.email,
        name=user.name,
    )


def _manual_container(request: Request):
    """Require an enabled manual journey and its same-origin browser mutation."""
    container = get_container()
    if not container.settings.laliga_manual_link_enabled:
        raise PairingError("Manual linking is unavailable", category="browser_unavailable")
    if request.headers.get("origin") != container.settings.frontend_origin.rstrip("/"):
        raise PairingError("Invalid request origin", category="pairing_callback")
    if container.settings.laliga_redirect_uri != NATIVE_REDIRECT:
        raise PairingError("Native callback is unavailable", category="browser_unavailable")
    return container


def _manual_state(callback: str) -> str:
    """Validate a native callback before looking up or consuming a challenge."""
    if re.search(r"%(?![0-9A-Fa-f]{2})", callback) or "\ufffd" in callback:
        raise PairingError("Invalid callback URL", category="pairing_callback")
    try:
        parsed = urlparse(callback)
    except ValueError as exc:
        raise PairingError("Invalid callback URL", category="pairing_callback") from exc
    if (
        parsed.scheme != "authredirect"
        or parsed.netloc != "com.lfp.laligafantasy"
        or parsed.path not in ("", "/")
        or parsed.params
        or parsed.fragment
        or parsed.username
        or parsed.password
        or not parsed.query
    ):
        raise PairingError("Invalid callback URL", category="pairing_callback")
    try:
        pairs = parse_qsl(
            parsed.query, keep_blank_values=True, strict_parsing=True, errors="strict"
        )
    except (ValueError, UnicodeDecodeError) as exc:
        raise PairingError("Invalid callback URL", category="pairing_callback") from exc
    if len({key for key, _ in pairs}) != len(pairs):
        raise PairingError("Duplicate callback parameter", category="pairing_callback")
    params = dict(pairs)
    if (
        not params.get("code")
        or not params.get("state")
        or "error" in params
        or any(ord(char) < 32 for char in params["code"] + params["state"])
    ):
        raise PairingError("Callback missing code or state", category="pairing_callback")
    return params["state"]


@router.post("/laliga/manual/start", response_model=ManualStartResponse)
async def manual_start(request: Request, response: Response) -> ManualStartResponse:
    """Start an explicitly requested, owner and browser bound native pairing."""
    user = await get_current_user(request)
    container = _manual_container(request)
    client_ip = request.client.host if request.client else "unknown"
    if not await container.rate_limiter.allow(
        f"pairing-start:{user.user_id}:{client_ip}",
        limit=container.settings.pairing_rate_limit_per_minute,
        window_seconds=60,
    ):
        raise PairingError("rate limited", category="rate_limited")
    binding = request.cookies.get(MANUAL_COOKIE) or generate_pairing_secret()
    binding_hash = hash_secret(binding)
    started = await container.pairings.begin_browser_login(
        user.user_id, redirect_uri=NATIVE_REDIRECT
    )
    expiry = container.clock.now() + container.settings.pairing_ttl_seconds
    await container.browser_pairings.save(
        BrowserPairingRecord(
            state=started.b2c_state,
            user_id=user.user_id,
            pairing_id=started.pairing_id,
            secret=started.secret,
            code_verifier=started.code_verifier,
            expires_at=expiry,
            binding_hash=binding_hash,
        ),
        now=container.clock.now(),
    )
    response.set_cookie(
        MANUAL_COOKIE,
        binding,
        max_age=container.settings.pairing_ttl_seconds,
        path=MANUAL_PATH,
        secure=True,
        httponly=True,
        samesite="lax",
    )
    return ManualStartResponse(authorize_url=started.authorize_url, expires_at=expiry)


@router.post(
    "/laliga/manual/complete",
    response_model=ConnectionStatusResponse,
    responses={413: {"model": AuthErrorResponse, "description": "Callback request too large."}},
)
async def manual_complete(
    body: ManualCompleteRequest, request: Request
) -> ConnectionStatusResponse:
    """Exchange a pasted callback only for its initiating user and browser."""
    user = await get_current_user(request)
    container = _manual_container(request)
    binding = request.cookies.get(MANUAL_COOKIE)
    if not binding:
        raise PairingError("Pairing not found or expired", category="pairing_not_found")
    client_ip = request.client.host if request.client else "unknown"
    if not await container.rate_limiter.allow(
        f"pairing-complete:{client_ip}",
        limit=container.settings.pairing_rate_limit_per_minute,
        window_seconds=60,
    ):
        raise PairingError("rate limited", category="rate_limited")
    state = _manual_state(body.callback)
    challenge = await container.browser_pairings.consume(
        state,
        now=container.clock.now(),
        binding_hash=hash_secret(binding),
        user_id=user.user_id,
    )
    if challenge is None:
        raise PairingError("Pairing not found or expired", category="pairing_not_found")
    await container.pairings.complete_browser_redirect(
        callback=body.callback,
        pairing_id=challenge.pairing_id,
        secret=challenge.secret,
        code_verifier=challenge.code_verifier,
        expected_state=challenge.state,
        redirect_uri=NATIVE_REDIRECT,
    )
    return ConnectionStatusResponse(**await container.pairings.get_status(user.user_id))


@router.delete("/laliga/manual/pending", response_model=OkResponse)
async def manual_cancel(request: Request) -> OkResponse:
    """Cancel only the current user's pending manual attempt in this browser."""
    user = await get_current_user(request)
    container = _manual_container(request)
    binding = request.cookies.get(MANUAL_COOKIE)
    if binding:
        await container.browser_pairings.cancel_bound(user.user_id, hash_secret(binding))
    return OkResponse(ok=True)


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


@router.post(
    "/laliga/login",
    response_model=BrowserLoginResponse,
    responses={503: {"model": AuthErrorResponse, "description": "Browser callback unavailable."}},
)
async def laliga_login(request: Request, response: Response) -> BrowserLoginResponse:
    """Start browser LaLiga delegation through a registered HTTPS callback.

    A random HttpOnly cookie binds the challenge to this browser; the callback
    rejects any other browser, so a victim cannot be linked to this account.
    """
    user = await get_current_user(request)
    container = get_container()
    redirect_uri = container.settings.laliga_browser_redirect_uri
    if redirect_uri is None:
        raise PairingError(
            "Browser linking requires a registered HTTPS callback", category="browser_unavailable"
        )
    started = await container.pairings.begin_browser_login(user.user_id, redirect_uri=redirect_uri)
    binding = generate_pairing_secret()
    await container.browser_pairings.save(
        BrowserPairingRecord(
            state=started.b2c_state,
            user_id=user.user_id,
            pairing_id=started.pairing_id,
            secret=started.secret,
            code_verifier=started.code_verifier,
            expires_at=container.clock.now() + container.settings.pairing_ttl_seconds,
            binding_hash=hash_secret(binding),
        ),
        now=container.clock.now(),
    )
    response.set_cookie(
        BINDING_COOKIE,
        binding,
        max_age=container.settings.pairing_ttl_seconds,
        path=CALLBACK_PATH,
        secure=True,
        httponly=True,
        samesite="lax",
    )
    return BrowserLoginResponse(authorize_url=started.authorize_url)


@router.get("/laliga/callback", response_class=RedirectResponse, status_code=303)
async def laliga_browser_callback(request: Request) -> RedirectResponse:
    """Complete a browser authorization and return to the fixed frontend origin."""
    container = get_container()
    redirect_uri = container.settings.laliga_browser_redirect_uri
    if redirect_uri is None:
        raise PairingError("Browser callback is unavailable", category="browser_unavailable")
    callback = f"{redirect_uri}?{request.url.query}"
    try:
        await _complete_browser_challenge(request, callback, redirect_uri=redirect_uri)
        destination = container.settings.frontend_origin
    except AuthError:
        destination = (
            f"{container.settings.frontend_origin.rstrip('/')}/connect-laliga"
            "?error=laliga_link_failed"
        )
    redirect = RedirectResponse(url=destination, status_code=303)
    redirect.delete_cookie(BINDING_COOKIE, path=CALLBACK_PATH, secure=True, httponly=True)
    return redirect


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
    await _complete_browser_challenge(request, body.callback)
    return CompleteRedirectResponse(
        ok=True,
        frontend_origin=get_container().settings.frontend_origin,
    )


async def _complete_browser_challenge(
    request: Request, callback: str, *, redirect_uri: str | None = None
) -> None:
    """Rate-limit and consume one state before exchanging its authorization code."""
    container = get_container()
    client_ip = request.client.host if request.client else "unknown"
    allowed = await container.rate_limiter.allow(
        f"pairing-complete:{client_ip}",
        limit=container.settings.pairing_rate_limit_per_minute,
        window_seconds=60,
    )
    if not allowed:
        raise PairingError("rate limited", category="rate_limited")
    state = _state_from_callback(callback)
    if not state:
        raise PairingError("callback missing state", category="pairing_callback")
    binding_hash: str | None = ""
    if redirect_uri is not None:
        binding = request.cookies.get(BINDING_COOKIE)
        if not binding:
            raise PairingError("callback not bound to this browser", category="pairing_not_found")
        binding_hash = hash_secret(binding)
    challenge = await container.browser_pairings.consume(
        state, now=container.clock.now(), binding_hash=binding_hash
    )
    if challenge is None:
        raise PairingError("pairing not found or expired", category="pairing_not_found")
    await container.pairings.complete_browser_redirect(
        callback=callback,
        pairing_id=challenge.pairing_id,
        secret=challenge.secret,
        code_verifier=challenge.code_verifier,
        expected_state=challenge.state,
        redirect_uri=redirect_uri,
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
