"""Interactive identity helper uses the shared origin and exports only an API JWT."""

# ---- Mocks, fixtures & helpers ---- #
from unittest.mock import MagicMock

import pytest
from fantasy_auth.cli.browser_session import identity
from fantasy_auth.cli.browser_session.errors import BrowserSessionError


class FixturePlaywrightError(Exception):
    pass


@pytest.fixture
def browser(monkeypatch):
    manager = MagicMock()
    playwright = manager.__enter__.return_value
    browser = playwright.chromium.launch.return_value
    context = browser.new_context.return_value
    session_response = MagicMock(ok=True)
    session_response.json.return_value = {"user": {"id": "alice"}}
    token_response = MagicMock(ok=True)
    token_response.json.return_value = {"token": "synthetic-jwt"}
    context.request.get.side_effect = lambda url, **_kwargs: (
        session_response if url.endswith("/get-session") else token_response
    )
    monkeypatch.setattr(
        identity,
        "import_sync_playwright",
        lambda: (FixturePlaywrightError, TimeoutError, lambda: manager),
    )
    return browser, context, session_response, token_response


# ---- Happy path ---- #
def test_login_completed_session_returns_only_framework_token(browser):
    instance, context, _session, _token = browser
    assert identity.login_with_playwright("https://app.example.test/") == "synthetic-jwt"
    context.new_page.return_value.goto.assert_called_once_with(
        "https://app.example.test/sign-in", wait_until="domcontentloaded"
    )
    assert context.request.get.call_args_list[0].args[0] == (
        "https://app.example.test/auth/get-session"
    )
    assert context.request.get.call_args_list[1].args[0] == "https://app.example.test/auth/token"
    context.new_page.return_value.wait_for_function.assert_not_called()
    instance.close.assert_called_once()


# ---- Error paths ---- #
def test_login_headless_without_token_is_rejected():
    with pytest.raises(BrowserSessionError, match="use --jwt"):
        identity.login_with_playwright("https://app.example.test", headed=False)


@pytest.mark.parametrize("payload", [{}, {"access_token": "legacy"}, {"token": 42}, []])
def test_login_invalid_token_contract_rejects_and_closes_browser(browser, payload):
    instance, _context, _session, token = browser
    token.json.return_value = payload
    with pytest.raises(BrowserSessionError, match="did not return"):
        identity.login_with_playwright("https://app.example.test")
    instance.close.assert_called_once()


def test_login_timeout_closes_browser_and_returns_actionable_error(browser, monkeypatch):
    instance, _context, _session, _token = browser
    clock = iter([0, 301])
    monkeypatch.setattr(identity.time, "monotonic", lambda: next(clock))
    with pytest.raises(BrowserSessionError, match="Login timed out"):
        identity.login_with_playwright("https://app.example.test")
    instance.close.assert_called_once()


# ---- Edge cases ---- #
def test_login_non_json_token_response_fails_without_dumping_response(browser):
    instance, _context, _session, token = browser
    token.json.side_effect = ValueError("private response")
    with pytest.raises(BrowserSessionError, match="invalid token response"):
        identity.login_with_playwright("https://app.example.test")
    instance.close.assert_called_once()
