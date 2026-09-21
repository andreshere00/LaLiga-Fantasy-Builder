"""Shared Playwright import for the browser-session CLI."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fantasy_auth.cli.browser_session.errors import (
    PLAYWRIGHT_INSTALL_HINT,
    BrowserSessionError,
)


def import_sync_playwright() -> tuple[Any, Any, Callable[..., Any]]:
    """Import Playwright sync types used by Keycloak login and capture.

    Returns:
        Tuple of ``(PlaywrightError, PlaywrightTimeout, sync_playwright)``.

    Raises:
        BrowserSessionError: When the Playwright extra is not installed.
    """
    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import TimeoutError as PlaywrightTimeout
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise BrowserSessionError(PLAYWRIGHT_INSTALL_HINT) from exc
    return PlaywrightError, PlaywrightTimeout, sync_playwright
