# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fantasy_auth.cli import helper as laliga_helper
from fantasy_auth.cli.browser_session import pairing
from fantasy_auth.cli.browser_session.errors import BrowserSessionError
from fantasy_auth.cli.browser_session.playwright_capture import header_location

# ---- Happy path ---- #


def test_pair_laliga_with_playwright_completes_from_captured_callback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(
        pairing,
        "_create_pairing",
        lambda **_kwargs: {
            "pairing_id": "pair-1",
            "secret": "sec-1",
            "nonce": "nonce-1",
            "expires_at": "1",
        },
    )
    fake_b2c = MagicMock()
    pkce = laliga_helper.PkceAuthorizeSession(
        authorize_url="https://login.example/authorize",
        verifier="verifier",
        state="state",
        nonce="nonce-1",
        redirect_uri="authredirect://com.lfp.laligafantasy",
        b2c=fake_b2c,
    )
    monkeypatch.setattr(laliga_helper, "start_pkce_session", lambda **_: pkce)
    monkeypatch.setattr(
        laliga_helper,
        "complete_pairing_from_callback",
        lambda **_kwargs: {"ok": True, "manager_id": "mgr-1"},
    )
    seen: list[str] = []

    def capture(url: str) -> str:
        seen.append(url)
        return "authredirect://com.lfp.laligafantasy/?code=abc&state=state"

    # Act
    result = pairing.pair_laliga_with_playwright(
        auth_base="http://auth.test",
        origin="http://localhost:8000",
        session="sess",
        csrf="csrf",
        capture_fn=capture,
    )

    # Assert
    assert result == {"ok": True, "manager_id": "mgr-1"}
    assert seen == ["https://login.example/authorize"]


def test_capture_authredirect_darwin_uses_macos_helper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(pairing.sys, "platform", "darwin")
    callback = "authredirect://com.lfp.laligafantasy/?state=s&code=" + ("x" * 120)
    monkeypatch.setattr(
        pairing.authredirect_macos,
        "capture_authredirect_macos",
        lambda *_args, **_kwargs: callback,
    )

    # Act
    result = pairing.capture_authredirect(
        "https://login.example/authorize",
        redirect_uri="authredirect://com.lfp.laligafantasy",
    )

    # Assert
    assert result == callback


# ---- Error paths ---- #


def test_pair_laliga_with_playwright_create_failed_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(pairing, "_create_pairing", lambda **_kwargs: None)

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="Create pairing failed"):
        pairing.pair_laliga_with_playwright(
            auth_base="http://auth.test",
            origin="http://localhost:8000",
            session="sess",
            csrf="csrf",
            capture_fn=lambda _url: "unused",
        )


def test_capture_authredirect_handler_error_falls_back_to_playwright(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(pairing.sys, "platform", "darwin")

    def boom(*_args: object, **_kwargs: object) -> str:
        raise pairing.authredirect_macos.AuthredirectHandlerError("osacompile")

    monkeypatch.setattr(
        pairing.authredirect_macos,
        "capture_authredirect_macos",
        boom,
    )
    monkeypatch.setattr(
        pairing,
        "capture_authredirect_with_playwright",
        lambda *_args, **_kwargs: "authredirect://ok",
    )

    # Act
    result = pairing.capture_authredirect(
        "https://login.example/authorize",
        redirect_uri="authredirect://com.lfp.laligafantasy",
    )

    # Assert
    assert result == "authredirect://ok"


def test_pair_laliga_complete_helper_error_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(
        pairing,
        "_create_pairing",
        lambda **_kwargs: {
            "pairing_id": "pair-1",
            "secret": "sec-1",
            "nonce": "nonce-1",
            "expires_at": "1",
        },
    )
    pkce = laliga_helper.PkceAuthorizeSession(
        authorize_url="https://login.example/authorize",
        verifier="verifier",
        state="state",
        nonce="nonce-1",
        redirect_uri="authredirect://com.lfp.laligafantasy",
        b2c=MagicMock(),
    )
    monkeypatch.setattr(laliga_helper, "start_pkce_session", lambda **_: pkce)

    def boom(**_kwargs: object) -> dict[str, object]:
        raise laliga_helper.PairingHelperError("bad callback")

    monkeypatch.setattr(laliga_helper, "complete_pairing_from_callback", boom)

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="bad callback"):
        pairing.pair_laliga_with_playwright(
            auth_base="http://auth.test",
            origin="http://localhost:8000",
            session="sess",
            csrf="csrf",
            capture_fn=lambda _url: "authredirect://cb",
        )


def test_capture_authredirect_timeout_wraps_macos_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(pairing.sys, "platform", "darwin")

    def boom(*_args: object, **_kwargs: object) -> str:
        raise pairing.authredirect_macos.AuthredirectTimeoutError("Timed out")

    monkeypatch.setattr(
        pairing.authredirect_macos,
        "capture_authredirect_macos",
        boom,
    )

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="Timed out"):
        pairing.capture_authredirect(
            "https://login.example/authorize",
            redirect_uri="authredirect://com.lfp.laligafantasy",
        )


# ---- Edge cases ---- #


def test_header_location_reads_case_insensitive_value() -> None:
    # Arrange / Act
    value = header_location({"Location": "authredirect://app/?code=1"})

    # Assert
    assert value == "authredirect://app/?code=1"
