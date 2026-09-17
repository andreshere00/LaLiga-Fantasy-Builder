"""Playwright Keycloak login for local demo users."""

from __future__ import annotations

from fantasy_auth.cli.browser_session.errors import BrowserSessionError
from fantasy_auth.cli.browser_session.playwright_util import import_sync_playwright


def login_with_playwright(
    auth_base: str,
    username: str,
    password: str,
    headed: bool,
) -> tuple[str, str]:
    """Open /auth/login, complete Keycloak form, return session cookies.

    Args:
        auth_base: Auth service origin.
        username: Keycloak username.
        password: Keycloak password.
        headed: When True, show the browser window.

    Returns:
        Tuple of ``(fantasy_session, fantasy_csrf)``.

    Raises:
        BrowserSessionError: When Playwright is missing or login fails.
    """
    _, playwright_timeout, sync_playwright = import_sync_playwright()
    login_url = f"{auth_base.rstrip('/')}/auth/login"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not headed)
        context = browser.new_context()
        page = context.new_page()
        try:
            page.goto(login_url, wait_until="domcontentloaded")
            form = page.locator("#username")
            if form.count() > 0:
                form.wait_for(state="visible", timeout=20_000)
                form.fill(username)
                page.locator("#password").fill(password)
                page.locator("#kc-login").click()
            page.wait_for_url("**/auth/callback**", timeout=60_000)
        except playwright_timeout as exc:
            raise BrowserSessionError(
                "Timed out waiting for Keycloak login or /auth/callback. "
                "Is Keycloak on :8080 and auth on :8000?",
            ) from exc
        cookies = {
            cookie["name"]: cookie["value"] for cookie in context.cookies()
        }
        browser.close()

    session = cookies.get("fantasy_session") or ""
    csrf = cookies.get("fantasy_csrf") or ""
    if not session or not csrf:
        raise BrowserSessionError(
            "Login finished but fantasy_session/fantasy_csrf cookies are missing.",
        )
    if session == csrf:
        raise BrowserSessionError(
            "Session and CSRF cookies were identical; login did not complete.",
        )
    return session, csrf
