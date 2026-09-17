"""Errors for the browser-session CLI."""

from __future__ import annotations

PLAYWRIGHT_INSTALL_HINT = (
    "Playwright is not installed. From backend/auth run:\n"
    "  uv sync --extra browser\n"
    "  uv run playwright install chromium"
)


class BrowserSessionError(RuntimeError):
    """Local browser login, pairing, or API call failed."""
