"""Playwright capture of native ``authredirect://`` callbacks."""

from __future__ import annotations

import sys
import time
from collections.abc import Callable
from typing import Any

from fantasy_auth.cli import helper as laliga_helper
from fantasy_auth.cli.browser_session.errors import BrowserSessionError
from fantasy_auth.cli.browser_session.playwright_util import import_sync_playwright


def capture_authredirect_with_playwright(
    authorize_url: str,
    *,
    redirect_uri: str,
    headed: bool = True,
    timeout_ms: int = 180_000,
) -> str:
    """Open B2C authorize in Chrome/Chromium and capture the native redirect.

    Args:
        authorize_url: LaLiga B2C authorize URL (PKCE).
        redirect_uri: Expected ``authredirect://`` prefix.
        headed: When True, show the browser window.
        timeout_ms: How long to wait for a complete callback.

    Returns:
        Full ``authredirect://`` callback URL including the authorization code.

    Raises:
        BrowserSessionError: When Playwright is missing or capture times out.
    """
    playwright_error, _timeout, sync_playwright = import_sync_playwright()
    captured: list[str] = []

    def consider(url: str | None) -> None:
        if not url or captured:
            return
        picked = laliga_helper.pick_complete_callback(
            url,
            redirect_uri=redirect_uri,
        )
        if picked:
            captured.append(picked)

    with sync_playwright() as playwright:
        browser = _launch_pairing_browser(playwright, headed=headed)
        try:
            context = browser.new_context()
            page = context.new_page()
            _attach_context_listeners(context, consider)
            try:
                page.goto(authorize_url, wait_until="domcontentloaded")
            except playwright_error as exc:
                consider(str(exc))
                if not captured:
                    raise BrowserSessionError(
                        f"Failed to open LaLiga authorize URL: {exc}",
                    ) from exc
            deadline = time.monotonic() + timeout_ms / 1000
            while time.monotonic() < deadline and not captured:
                try:
                    context.wait_for_event("page", timeout=200)
                except playwright_error:
                    continue
        except playwright_error as exc:
            if captured:
                return captured[0]
            raise BrowserSessionError(
                "The pairing browser closed before the LaLiga callback arrived. "
                "Keep the window open until sign-in finishes.",
            ) from exc
        finally:
            browser.close()

    if not captured:
        raise BrowserSessionError(
            "Timed out waiting for LaLiga authredirect:// callback. "
            "Finish sign-in in the browser window before the pairing expires.",
        )
    print(
        f"Callback captured from Chromium ({len(captured[0])} chars)",
        file=sys.stderr,
    )
    return captured[0]


def header_location(headers: dict[str, Any]) -> str | None:
    """Read a Location header from a CDP header map."""
    for key, value in headers.items():
        if str(key).lower() == "location":
            return str(value)
    return None


def _launch_pairing_browser(playwright: Any, *, headed: bool) -> Any:
    """Launch installed Chrome when possible; otherwise Playwright Chromium."""
    playwright_error, _timeout, _sync = import_sync_playwright()
    launch_kwargs: dict[str, Any] = {
        "headless": not headed,
        "args": ["--disable-blink-features=AutomationControlled"],
        "ignore_default_args": ["--enable-automation"],
    }
    try:
        return playwright.chromium.launch(channel="chrome", **launch_kwargs)
    except playwright_error:
        print(
            "Google Chrome not found; using Chromium "
            "(Google login is often blocked in this browser).",
            file=sys.stderr,
        )
        return playwright.chromium.launch(headless=not headed)


def _attach_context_listeners(
    context: Any,
    consider: Callable[[str | None], None],
) -> None:
    """Attach authredirect listeners to current and future pages."""

    def attach(page: Any) -> None:
        _attach_page_listeners(page, consider)

    context.on("page", attach)
    for page in context.pages:
        attach(page)


def _attach_page_listeners(
    page: Any,
    consider: Callable[[str | None], None],
) -> None:
    """Subscribe to navigation and CDP events that may carry authredirect://."""
    page.on("request", lambda request: consider(request.url))
    page.on("requestfailed", lambda request: consider(request.url))
    page.on("framenavigated", lambda frame: consider(frame.url))

    def on_response(response: Any) -> None:
        consider(response.url)
        consider(response.headers.get("location"))

    page.on("response", on_response)
    try:
        cdp = page.context.new_cdp_session(page)
        cdp.send("Network.enable")
        cdp.send(
            "Fetch.enable",
            {"patterns": [{"urlPattern": "authredirect://*"}]},
        )

        def on_paused(params: dict[str, Any]) -> None:
            request = params.get("request") or {}
            consider(str(request.get("url") or ""))
            request_id = params.get("requestId")
            if not request_id:
                return
            try:
                cdp.send(
                    "Fetch.failRequest",
                    {"requestId": request_id, "errorReason": "Aborted"},
                )
            except Exception:
                return

        def on_sent(params: dict[str, Any]) -> None:
            request = params.get("request") or {}
            consider(str(request.get("url") or ""))
            redirect = params.get("redirectResponse") or {}
            consider(str(redirect.get("url") or ""))
            consider(header_location(redirect.get("headers") or {}))

        def on_received(params: dict[str, Any]) -> None:
            response = params.get("response") or {}
            consider(str(response.get("url") or ""))
            consider(header_location(response.get("headers") or {}))

        cdp.on("Fetch.requestPaused", on_paused)
        cdp.on("Network.requestWillBeSent", on_sent)
        cdp.on("Network.responseReceived", on_received)
    except Exception:
        return
