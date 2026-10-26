"""Interactive Better Auth login; provider passwords stay under user control."""

from __future__ import annotations

import time
from typing import Any

from fantasy_auth.cli.browser_session.errors import BrowserSessionError
from fantasy_auth.cli.browser_session.playwright_util import import_sync_playwright


def login_with_playwright(auth_base: str, *, headed: bool = True) -> str:
    """Open the application sign-in screen and obtain its framework-issued JWT.

    Args:
        auth_base: Shared frontend origin, serving both screens and /auth.
        headed: Interactive login requires a visible browser.

    Returns:
        Short-lived application JWT. No session cookies are exported.
    """
    if not headed:
        raise BrowserSessionError("Interactive login needs a window; use --jwt for headless reads")
    playwright_error, _timeout_error, sync_playwright = import_sync_playwright()
    with sync_playwright() as playwright:
        browser = None
        try:
            browser = playwright.chromium.launch(headless=False)
            context = browser.new_context()
            page = context.new_page()
            page.goto(f"{auth_base.rstrip('/')}/sign-in", wait_until="domcontentloaded")
            _wait_for_session(context.request, auth_base.rstrip("/"), playwright_error)
            response = context.request.get(f"{auth_base.rstrip('/')}/auth/token")
            try:
                body = response.json() if response.ok else {}
            except ValueError:
                raise BrowserSessionError(
                    "Better Auth returned an invalid token response"
                ) from None
            token = body.get("token") if isinstance(body, dict) else None
            if not isinstance(token, str) or not token:
                raise BrowserSessionError("Better Auth did not return an application token")
            return token
        except playwright_error as exc:
            raise BrowserSessionError(
                "Browser sign-in failed. Check the app and try again."
            ) from exc
        finally:
            if browser is not None:
                browser.close()


def _wait_for_session(request: Any, auth_base: str, request_error: type[Exception]) -> None:
    """Poll the fixed app origin while the visible page may navigate to LaLiga."""
    deadline = time.monotonic() + 300
    while time.monotonic() < deadline:
        try:
            response = request.get(f"{auth_base}/auth/get-session", timeout=5000)
            session = response.json() if response.ok else None
        except (request_error, ValueError):
            session = None
        if isinstance(session, dict) and isinstance(session.get("user"), dict):
            user_id = session["user"].get("id")
            if isinstance(user_id, str) and user_id:
                return
        time.sleep(1)
    raise BrowserSessionError("Login timed out. Start the app and complete sign-in.")
