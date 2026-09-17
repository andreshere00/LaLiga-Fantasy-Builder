# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from pathlib import Path

import pytest
from fantasy_auth.cli import authredirect_macos as macos

REDIRECT = "authredirect://com.lfp.laligafantasy"
LONG_CODE = "x" * 120


# ---- Happy path ---- #


def test_applescript_source_includes_callback_path(tmp_path: Path) -> None:
    # Arrange
    callback = tmp_path / "callback.txt"

    # Act
    source = macos._applescript_source(callback)

    # Assert
    assert "on open location theURL" in source
    assert str(callback.resolve()) in source


def test_capture_authredirect_macos_reads_helper_file(tmp_path: Path) -> None:
    # Arrange
    callback = f"{REDIRECT}/?state=s&code={LONG_CODE}"

    def open_url(_url: str) -> None:
        (tmp_path / macos.CALLBACK_NAME).write_text(callback, encoding="utf-8")

    # Act
    result = macos.capture_authredirect_macos(
        "https://login.example/authorize",
        redirect_uri=REDIRECT,
        support_dir=tmp_path,
        prepare_handler=lambda _directory: None,
        open_url=open_url,
        timeout_ms=1_000,
        sleep=lambda _seconds: None,
    )

    # Assert
    assert result.startswith(REDIRECT)
    assert LONG_CODE in result
    assert not (tmp_path / macos.CALLBACK_NAME).exists()


def test_handler_app_ready_matching_stamp_returns_true(tmp_path: Path) -> None:
    # Arrange
    app = tmp_path / macos.APP_NAME
    plist = app / "Contents" / "Info.plist"
    plist.parent.mkdir(parents=True)
    callback = tmp_path / macos.CALLBACK_NAME
    with plist.open("wb") as handle:
        macos.plistlib.dump({"CFBundleIdentifier": macos.BUNDLE_ID}, handle)
    (tmp_path / macos.STAMP_NAME).write_text(
        str(callback.resolve()),
        encoding="utf-8",
    )

    # Act
    ready = macos._handler_app_ready(app, callback)

    # Assert
    assert ready is True


# ---- Error paths ---- #


def test_capture_authredirect_macos_timeout_raises(tmp_path: Path) -> None:
    # Arrange
    clock = iter([0.0, 0.0, 1.0])

    # Act / Assert
    with pytest.raises(macos.AuthredirectTimeoutError, match="Timed out"):
        macos.capture_authredirect_macos(
            "https://login.example/authorize",
            redirect_uri=REDIRECT,
            support_dir=tmp_path,
            prepare_handler=lambda _directory: None,
            open_url=lambda _url: None,
            timeout_ms=500,
            sleep=lambda _seconds: None,
            monotonic=lambda: next(clock),
        )


def test_applescript_source_quote_in_path_raises(tmp_path: Path) -> None:
    # Arrange
    callback = tmp_path / 'bad"name.txt'

    # Act / Assert
    with pytest.raises(macos.AuthredirectHandlerError, match="quote"):
        macos._applescript_source(callback)


# ---- Edge cases ---- #


def test_handler_app_ready_missing_app_returns_false(tmp_path: Path) -> None:
    # Arrange
    app = tmp_path / macos.APP_NAME
    callback = tmp_path / macos.CALLBACK_NAME

    # Act / Assert
    assert macos._handler_app_ready(app, callback) is False


def test_read_complete_callback_missing_file_returns_none(tmp_path: Path) -> None:
    # Arrange
    path = tmp_path / "missing.txt"

    # Act
    result = macos._read_complete_callback(path, redirect_uri=REDIRECT)

    # Assert
    assert result is None
