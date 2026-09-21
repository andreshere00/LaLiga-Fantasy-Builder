"""LaLiga pairing and native-redirect capture."""

from __future__ import annotations

import sys
from collections.abc import Callable
from typing import Any

from fantasy_auth.cli import authredirect_macos
from fantasy_auth.cli import helper as laliga_helper
from fantasy_auth.cli.browser_session.errors import BrowserSessionError
from fantasy_auth.cli.browser_session.playwright_capture import (
    capture_authredirect_with_playwright,
)
from fantasy_auth.cli.pair import _create_pairing

CaptureFn = Callable[[str], str]


def pair_laliga_with_playwright(
    *,
    auth_base: str,
    origin: str,
    session: str,
    csrf: str,
    headed: bool = True,
    capture_fn: CaptureFn | None = None,
) -> dict[str, Any]:
    """Create a pairing and complete PKCE by intercepting authredirect://.

    LaLiga B2C still needs an interactive sign-in. On macOS that happens in
    the default browser so Google login works. The native callback is captured
    automatically; nothing is pasted in the terminal.

    Args:
        auth_base: Auth service origin.
        origin: Origin header for CSRF.
        session: ``fantasy_session`` cookie.
        csrf: CSRF cookie and header.
        headed: When True, show a window for the Playwright fallback.
        capture_fn: Optional callback capture (tests). Receives the authorize URL.

    Returns:
        JSON body from POST /laliga/pairings/{id}/complete.

    Raises:
        BrowserSessionError: When pairing create, capture, or complete fails.
    """
    pairing = _create_pairing(
        api_base=auth_base,
        session=session,
        csrf=csrf,
        origin=origin,
    )
    if pairing is None:
        raise BrowserSessionError("Create pairing failed")
    print(
        f"Pairing created: {pairing['pairing_id']} " f"(expires_at={pairing['expires_at']})",
        file=sys.stderr,
    )
    pkce = laliga_helper.start_pkce_session(nonce=pairing["nonce"])
    capture = capture_fn or (
        lambda url: capture_authredirect(
            url,
            redirect_uri=pkce.redirect_uri,
            headed=headed,
        )
    )
    print(
        "Sign in to LaLiga in the browser window (Google is supported). "
        "Do not copy or paste the callback URL.",
        file=sys.stderr,
    )
    callback = capture(pkce.authorize_url)
    try:
        return laliga_helper.complete_pairing_from_callback(
            callback=callback,
            pairing_id=pairing["pairing_id"],
            secret=pairing["secret"],
            expected_state=pkce.state,
            verifier=pkce.verifier,
            redirect_uri=pkce.redirect_uri,
            api_base=auth_base,
            b2c=pkce.b2c,
        )
    except laliga_helper.PairingHelperError as exc:
        raise BrowserSessionError(str(exc)) from exc


def capture_authredirect(
    authorize_url: str,
    *,
    redirect_uri: str,
    headed: bool = True,
    timeout_ms: int = 180_000,
) -> str:
    """Capture the native B2C redirect without a terminal paste.

    On macOS this opens the default browser so Google sign-in works. If the
    helper app cannot be registered, Playwright Chrome/Chromium is used.

    Args:
        authorize_url: LaLiga B2C authorize URL (PKCE).
        redirect_uri: Expected ``authredirect://`` prefix.
        headed: When True, show a window for the Playwright fallback.
        timeout_ms: How long to wait for a complete callback.

    Returns:
        Full ``authredirect://`` callback URL including the authorization code.

    Raises:
        BrowserSessionError: When capture fails or times out.
    """
    if sys.platform == "darwin":
        try:
            return authredirect_macos.capture_authredirect_macos(
                authorize_url,
                redirect_uri=redirect_uri,
                timeout_ms=timeout_ms,
            )
        except authredirect_macos.AuthredirectTimeoutError as exc:
            raise BrowserSessionError(str(exc)) from exc
        except authredirect_macos.AuthredirectHandlerError as exc:
            print(
                f"macOS callback helper failed ({exc}). "
                "Falling back to Chrome; Google login may be blocked.",
                file=sys.stderr,
            )
    return capture_authredirect_with_playwright(
        authorize_url,
        redirect_uri=redirect_uri,
        headed=headed,
        timeout_ms=timeout_ms,
    )
