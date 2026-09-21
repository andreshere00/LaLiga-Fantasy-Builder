# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace
from typing import Any

import pytest
from fantasy_auth.cli.browser_session import playwright_capture as capture_mod
from fantasy_auth.cli.browser_session.errors import (
    PLAYWRIGHT_INSTALL_HINT,
    BrowserSessionError,
)
from fantasy_auth.cli.browser_session.playwright_capture import (
    capture_authredirect_with_playwright,
    header_location,
)
from fantasy_auth.cli.browser_session.playwright_util import import_sync_playwright

REDIRECT = "authredirect://com.lfp.laligafantasy"
COMPLETE = f"{REDIRECT}/?state=s&code={'c' * 120}"


class FakePlaywrightError(Exception):
    """Stand-in for Playwright Error/Timeout used by capture helpers."""


class FakeCDP:
    """Records CDP commands and stores event handlers."""

    def __init__(self) -> None:
        self.handlers: dict[str, Any] = {}
        self.sent: list[tuple[str, Any]] = []

    def send(self, method: str, params: dict[str, Any] | None = None) -> None:
        self.sent.append((method, params))
        if method == "Fetch.failRequest":
            raise RuntimeError("request already finished")

    def on(self, event: str, handler: Any) -> None:
        self.handlers[event] = handler


class FakePage:
    """Minimal page that stores listeners and can fail goto."""

    def __init__(self, *, goto_error: Exception | None = None) -> None:
        self.context: FakeContext | None = None
        self.goto_error = goto_error
        self.handlers: dict[str, list[Any]] = {}

    def goto(self, _url: str, **_kwargs: Any) -> None:
        if self.goto_error is not None:
            raise self.goto_error

    def on(self, event: str, handler: Any) -> None:
        self.handlers.setdefault(event, []).append(handler)


class FakeContext:
    """Browser context that can emit capture events during wait_for_event."""

    def __init__(
        self,
        *,
        page: FakePage | None = None,
        wait_error: Exception | None = None,
        capture_on_wait: str | None = None,
        cdp: FakeCDP | None = None,
        cdp_error: Exception | None = None,
    ) -> None:
        self.page = page or FakePage()
        self.page.context = self
        self.pages = [self.page]
        self.wait_error = wait_error
        self.capture_on_wait = capture_on_wait
        self.cdp = cdp
        self.cdp_error = cdp_error
        self.page_listeners: list[Any] = []

    def new_page(self) -> FakePage:
        return self.page

    def on(self, event: str, handler: Any) -> None:
        if event == "page":
            self.page_listeners.append(handler)

    def wait_for_event(self, _event: str, timeout: int | None = None) -> None:
        if self.capture_on_wait:
            url = self.capture_on_wait
            self.capture_on_wait = None
            self._emit_listeners(url)
            self._fire_cdp(url)
        if self.wait_error is not None:
            raise self.wait_error

    def new_cdp_session(self, _page: FakePage) -> FakeCDP:
        if self.cdp_error is not None:
            raise self.cdp_error
        if self.cdp is None:
            self.cdp = FakeCDP()
        return self.cdp

    def _emit_listeners(self, url: str) -> None:
        for handler in self.page.handlers.get("request", []):
            handler(SimpleNamespace(url=""))
            handler(SimpleNamespace(url=url))
        for handler in self.page.handlers.get("requestfailed", []):
            handler(SimpleNamespace(url=""))
        for handler in self.page.handlers.get("framenavigated", []):
            handler(SimpleNamespace(url=url))
        for handler in self.page.handlers.get("response", []):
            handler(SimpleNamespace(url=url, headers={"location": url}))
        if self.page_listeners:
            extra = FakePage()
            extra.context = self
            self.page_listeners[0](extra)

    def _fire_cdp(self, url: str) -> None:
        if self.cdp is None:
            return
        paused = self.cdp.handlers.get("Fetch.requestPaused")
        if paused is not None:
            paused({"request": {"url": ""}})
            paused({"request": {"url": url}, "requestId": "r1"})
        sent = self.cdp.handlers.get("Network.requestWillBeSent")
        if sent is not None:
            sent(
                {
                    "request": {"url": "https://login.example"},
                    "redirectResponse": {
                        "url": url,
                        "headers": {"LOCATION": url},
                    },
                }
            )
        received = self.cdp.handlers.get("Network.responseReceived")
        if received is not None:
            received({"response": {"url": url, "headers": {"x": "1"}}})


class FakeBrowser:
    """Returns a prepared context and records close()."""

    def __init__(
        self,
        context: FakeContext,
        *,
        new_context_error: Exception | None = None,
    ) -> None:
        self._context = context
        self.new_context_error = new_context_error
        self.closed = False

    def new_context(self) -> FakeContext:
        if self.new_context_error is not None:
            raise self.new_context_error
        return self._context

    def close(self) -> None:
        self.closed = True


class FakeChromium:
    """Launches the fake browser, optionally failing channel=chrome."""

    def __init__(self, browser: FakeBrowser, *, fail_chrome: bool = False) -> None:
        self._browser = browser
        self.fail_chrome = fail_chrome
        self.launches: list[dict[str, Any]] = []

    def launch(self, **kwargs: Any) -> FakeBrowser:
        self.launches.append(kwargs)
        if kwargs.get("channel") == "chrome" and self.fail_chrome:
            raise FakePlaywrightError("Google Chrome not installed")
        return self._browser


class FakePlaywright:
    """Context manager matching sync_playwright() usage."""

    def __init__(self, chromium: FakeChromium) -> None:
        self.chromium = chromium

    def __enter__(self) -> FakePlaywright:
        return self

    def __exit__(self, *_args: object) -> None:
        return None


def _wire_playwright(
    monkeypatch: pytest.MonkeyPatch,
    context: FakeContext,
    *,
    fail_chrome: bool = False,
    new_context_error: Exception | None = None,
) -> FakeChromium:
    browser = FakeBrowser(context, new_context_error=new_context_error)
    chromium = FakeChromium(browser, fail_chrome=fail_chrome)
    playwright = FakePlaywright(chromium)

    def import_sync() -> tuple[type[FakePlaywrightError], type[FakePlaywrightError], Any]:
        return FakePlaywrightError, FakePlaywrightError, lambda: playwright

    monkeypatch.setattr(capture_mod, "import_sync_playwright", import_sync)
    return chromium


# ---- Happy path ---- #


def test_capture_authredirect_with_playwright_returns_callback(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    context = FakeContext(capture_on_wait=COMPLETE, cdp=FakeCDP())
    chromium = _wire_playwright(monkeypatch, context, fail_chrome=True)

    # Act
    result = capture_authredirect_with_playwright(
        "https://login.example/authorize",
        redirect_uri=REDIRECT,
        headed=True,
        timeout_ms=5_000,
    )

    # Assert
    assert result == COMPLETE
    assert chromium.launches[0]["channel"] == "chrome"
    assert "channel" not in chromium.launches[1]
    assert "Callback captured from Chromium" in capsys.readouterr().err


def test_capture_authredirect_goto_error_with_callback_returns_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    page = FakePage(goto_error=FakePlaywrightError(COMPLETE))
    context = FakeContext(page=page)
    _wire_playwright(monkeypatch, context)

    # Act
    result = capture_authredirect_with_playwright(
        "https://login.example/authorize",
        redirect_uri=REDIRECT,
        headed=False,
        timeout_ms=1,
    )

    # Assert
    assert result == COMPLETE


def test_header_location_missing_key_returns_none() -> None:
    # Arrange / Act / Assert
    assert header_location({"content-type": "text/html"}) is None


def test_import_sync_playwright_success_returns_triple(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    fake_playwright = ModuleType("playwright")
    fake_sync = ModuleType("playwright.sync_api")

    class Error(Exception):
        pass

    class TimeoutError(Exception):
        pass

    def sync_playwright() -> None:
        return None

    fake_sync.Error = Error  # type: ignore[attr-defined]
    fake_sync.TimeoutError = TimeoutError  # type: ignore[attr-defined]
    fake_sync.sync_playwright = sync_playwright  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "playwright", fake_playwright)
    monkeypatch.setitem(sys.modules, "playwright.sync_api", fake_sync)

    # Act
    error_cls, timeout_cls, sync_fn = import_sync_playwright()

    # Assert
    assert error_cls is Error
    assert timeout_cls is TimeoutError
    assert sync_fn is sync_playwright


# ---- Error paths ---- #


def test_capture_authredirect_timeout_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    context = FakeContext(wait_error=FakePlaywrightError("idle"))
    _wire_playwright(monkeypatch, context)
    clock = {"t": 0.0}

    def monotonic() -> float:
        current = clock["t"]
        clock["t"] += 1.0
        return current

    monkeypatch.setattr(capture_mod.time, "monotonic", monotonic)

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="Timed out waiting"):
        capture_authredirect_with_playwright(
            "https://login.example/authorize",
            redirect_uri=REDIRECT,
            timeout_ms=500,
        )


def test_capture_authredirect_goto_failure_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    page = FakePage(goto_error=FakePlaywrightError("net::ERR_FAILED"))
    context = FakeContext(page=page)
    _wire_playwright(monkeypatch, context)

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="Failed to open LaLiga authorize URL"):
        capture_authredirect_with_playwright(
            "https://login.example/authorize",
            redirect_uri=REDIRECT,
            timeout_ms=1,
        )


def test_capture_authredirect_browser_closed_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    context = FakeContext()
    _wire_playwright(
        monkeypatch,
        context,
        new_context_error=FakePlaywrightError("Target closed"),
    )

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="pairing browser closed"):
        capture_authredirect_with_playwright(
            "https://login.example/authorize",
            redirect_uri=REDIRECT,
            timeout_ms=1,
        )


def test_import_sync_playwright_missing_package_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.delitem(sys.modules, "playwright.sync_api", raising=False)
    monkeypatch.delitem(sys.modules, "playwright", raising=False)
    real_import = __import__

    def fake_import(name: str, *args: Any, **kwargs: Any) -> Any:
        if name == "playwright" or name.startswith("playwright."):
            raise ImportError("No module named playwright")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", fake_import)

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="Playwright is not installed"):
        import_sync_playwright()


# ---- Edge cases ---- #


def test_capture_authredirect_cdp_attach_failure_still_captures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    context = FakeContext(
        capture_on_wait=COMPLETE,
        cdp_error=RuntimeError("cdp unavailable"),
    )
    _wire_playwright(monkeypatch, context)

    # Act
    result = capture_authredirect_with_playwright(
        "https://login.example/authorize",
        redirect_uri=REDIRECT,
        timeout_ms=5_000,
    )

    # Assert
    assert result == COMPLETE


def test_import_sync_playwright_error_message_includes_install_hint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.delitem(sys.modules, "playwright.sync_api", raising=False)
    monkeypatch.delitem(sys.modules, "playwright", raising=False)

    def fake_import(name: str, *args: Any, **kwargs: Any) -> Any:
        if name == "playwright" or name.startswith("playwright."):
            raise ImportError("missing")
        return __import__(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", fake_import)

    # Act / Assert
    with pytest.raises(BrowserSessionError) as exc_info:
        import_sync_playwright()
    assert PLAYWRIGHT_INSTALL_HINT in str(exc_info.value)
