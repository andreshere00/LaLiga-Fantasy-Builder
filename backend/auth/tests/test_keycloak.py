# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from typing import Any

import pytest
from fantasy_auth.cli.browser_session import keycloak as keycloak_mod
from fantasy_auth.cli.browser_session.errors import BrowserSessionError
from fantasy_auth.cli.browser_session.keycloak import login_with_playwright


class FakeTimeout(Exception):
    """Stand-in for Playwright TimeoutError."""


class FakeLocator:
    """Locator that reports whether the Keycloak username field exists."""

    def __init__(self, count: int) -> None:
        self._count = count
        self.filled: list[str] = []
        self.clicked = False

    def count(self) -> int:
        return self._count

    def wait_for(self, **_kwargs: Any) -> None:
        return None

    def fill(self, value: str) -> None:
        self.filled.append(value)

    def click(self) -> None:
        self.clicked = True


class FakePage:
    """Page that can complete login or time out waiting for /auth/callback."""

    def __init__(self, *, form_count: int = 1, timeout: bool = False) -> None:
        self.form_count = form_count
        self.timeout = timeout
        self.locators: dict[str, FakeLocator] = {}
        self.goto_urls: list[str] = []

    def goto(self, url: str, **_kwargs: Any) -> None:
        self.goto_urls.append(url)

    def locator(self, selector: str) -> FakeLocator:
        locator = self.locators.get(selector)
        if locator is None:
            locator = FakeLocator(self.form_count)
            self.locators[selector] = locator
        return locator

    def wait_for_url(self, _pattern: str, timeout: int | None = None) -> None:
        if self.timeout:
            raise FakeTimeout("callback never arrived")


class FakeContext:
    """Returns cookies after the mocked login."""

    def __init__(self, page: FakePage, cookies: list[dict[str, str]]) -> None:
        self._page = page
        self._cookies = cookies

    def new_page(self) -> FakePage:
        return self._page

    def cookies(self) -> list[dict[str, str]]:
        return self._cookies


class FakeBrowser:
    """Records launch/close around a fake context."""

    def __init__(self, context: FakeContext) -> None:
        self._context = context
        self.closed = False
        self.launch_kwargs: dict[str, Any] = {}

    def new_context(self) -> FakeContext:
        return self._context

    def close(self) -> None:
        self.closed = True


class FakeChromium:
    def __init__(self, browser: FakeBrowser) -> None:
        self._browser = browser

    def launch(self, **kwargs: Any) -> FakeBrowser:
        self._browser.launch_kwargs = kwargs
        return self._browser


class FakePlaywright:
    def __init__(self, chromium: FakeChromium) -> None:
        self.chromium = chromium

    def __enter__(self) -> FakePlaywright:
        return self

    def __exit__(self, *_args: object) -> None:
        return None


def _install(
    monkeypatch: pytest.MonkeyPatch,
    *,
    cookies: list[dict[str, str]],
    form_count: int = 1,
    timeout: bool = False,
) -> FakeBrowser:
    page = FakePage(form_count=form_count, timeout=timeout)
    context = FakeContext(page, cookies)
    browser = FakeBrowser(context)
    playwright = FakePlaywright(FakeChromium(browser))

    def import_sync() -> tuple[Any, type[FakeTimeout], Any]:
        return Exception, FakeTimeout, lambda: playwright

    monkeypatch.setattr(keycloak_mod, "import_sync_playwright", import_sync)
    return browser


# ---- Happy path ---- #


def test_login_with_playwright_fills_form_and_returns_cookies(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    browser = _install(
        monkeypatch,
        cookies=[
            {"name": "fantasy_session", "value": "sess-1"},
            {"name": "fantasy_csrf", "value": "csrf-1"},
        ],
    )

    # Act
    session, csrf = login_with_playwright(
        "http://auth.test/",
        "demo",
        "secret",
        headed=True,
    )

    # Assert
    assert session == "sess-1"
    assert csrf == "csrf-1"
    assert browser.closed is True
    assert browser.launch_kwargs["headless"] is False
    username = browser._context._page.locators["#username"]
    assert username.filled == ["demo"]


def test_login_with_playwright_skips_form_when_already_on_callback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    _install(
        monkeypatch,
        cookies=[
            {"name": "fantasy_session", "value": "sess"},
            {"name": "fantasy_csrf", "value": "csrf"},
        ],
        form_count=0,
    )

    # Act
    session, csrf = login_with_playwright(
        "http://auth.test",
        "demo",
        "demo",
        headed=False,
    )

    # Assert
    assert session == "sess"
    assert csrf == "csrf"


# ---- Error paths ---- #


def test_login_with_playwright_timeout_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    _install(monkeypatch, cookies=[], timeout=True)

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="Timed out waiting for Keycloak"):
        login_with_playwright("http://auth.test", "demo", "demo", headed=False)


def test_login_with_playwright_missing_cookies_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    _install(monkeypatch, cookies=[{"name": "other", "value": "x"}])

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="cookies are missing"):
        login_with_playwright("http://auth.test", "demo", "demo", headed=False)


def test_login_with_playwright_identical_cookies_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    _install(
        monkeypatch,
        cookies=[
            {"name": "fantasy_session", "value": "same"},
            {"name": "fantasy_csrf", "value": "same"},
        ],
    )

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="identical"):
        login_with_playwright("http://auth.test", "demo", "demo", headed=False)
