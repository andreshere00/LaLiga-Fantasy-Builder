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


def test_macos_support_dir_uses_home(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    # Arrange
    monkeypatch.setattr(macos.Path, "home", classmethod(lambda cls: tmp_path))

    # Act
    result = macos.macos_support_dir()

    # Assert
    assert result == tmp_path / "Library/Application Support/laliga-fantasy-builder"


def test_open_macos_url_invokes_open(monkeypatch: pytest.MonkeyPatch) -> None:
    # Arrange
    called: list[list[str]] = []

    def fake_run(cmd: list[str], **_kwargs: object) -> None:
        called.append(cmd)

    monkeypatch.setattr(macos.subprocess, "run", fake_run)

    # Act
    macos._open_macos_url("https://login.example")

    # Assert
    assert called == [["open", "https://login.example"]]


def test_open_macos_url_failure_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    # Arrange
    def boom(*_args: object, **_kwargs: object) -> None:
        raise OSError("no open")

    monkeypatch.setattr(macos.subprocess, "run", boom)

    # Act / Assert
    with pytest.raises(macos.AuthredirectHandlerError, match="Failed to open browser"):
        macos._open_macos_url("https://login.example")


def test_handler_app_ready_invalid_plist_returns_false(tmp_path: Path) -> None:
    # Arrange
    app = tmp_path / macos.APP_NAME
    plist = app / "Contents" / "Info.plist"
    plist.parent.mkdir(parents=True)
    plist.write_bytes(b"not-a-plist")
    (tmp_path / macos.STAMP_NAME).write_text("stamp", encoding="utf-8")

    # Act / Assert
    assert macos._handler_app_ready(app, tmp_path / macos.CALLBACK_NAME) is False


def test_handler_app_ready_wrong_bundle_returns_false(tmp_path: Path) -> None:
    # Arrange
    app = tmp_path / macos.APP_NAME
    plist = app / "Contents" / "Info.plist"
    plist.parent.mkdir(parents=True)
    with plist.open("wb") as handle:
        macos.plistlib.dump({"CFBundleIdentifier": "other.bundle"}, handle)
    callback = tmp_path / macos.CALLBACK_NAME
    (tmp_path / macos.STAMP_NAME).write_text(
        str(callback.resolve()),
        encoding="utf-8",
    )

    # Act / Assert
    assert macos._handler_app_ready(app, callback) is False


def test_compile_handler_app_writes_plist_and_stamp(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    app = tmp_path / macos.APP_NAME
    leftover = app / "old.txt"
    leftover.parent.mkdir(parents=True)
    leftover.write_text("stale", encoding="utf-8")
    callback = tmp_path / macos.CALLBACK_NAME

    def fake_run(cmd: list[str], **_kwargs: object) -> None:
        if cmd[0] == "osacompile":
            plist = Path(cmd[2]) / "Contents" / "Info.plist"
            plist.parent.mkdir(parents=True, exist_ok=True)
            with plist.open("wb") as handle:
                macos.plistlib.dump({"CFBundleName": "helper"}, handle)
            return None
        raise OSError("codesign unavailable")

    monkeypatch.setattr(macos.subprocess, "run", fake_run)

    # Act
    macos._compile_handler_app(app, callback)

    # Assert
    with (app / "Contents" / "Info.plist").open("rb") as handle:
        info = macos.plistlib.load(handle)
    assert info["CFBundleIdentifier"] == macos.BUNDLE_ID
    assert (tmp_path / macos.STAMP_NAME).read_text(encoding="utf-8") == str(callback.resolve())


def test_compile_handler_app_osacompile_failure_raises(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    def boom(*_args: object, **_kwargs: object) -> None:
        raise macos.subprocess.CalledProcessError(1, ["osacompile"], stderr="no osa")

    monkeypatch.setattr(macos.subprocess, "run", boom)

    # Act / Assert
    with pytest.raises(macos.AuthredirectHandlerError, match="osacompile failed"):
        macos._compile_handler_app(tmp_path / macos.APP_NAME, tmp_path / "cb.txt")


def test_register_handler_app_oserror_raises(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    def boom(*_args: object, **_kwargs: object) -> None:
        raise OSError("lsregister missing")

    monkeypatch.setattr(macos.subprocess, "run", boom)

    # Act / Assert
    with pytest.raises(macos.AuthredirectHandlerError, match="lsregister failed"):
        macos._register_handler_app(tmp_path / macos.APP_NAME)


def test_rmtree_removes_nested_directory(tmp_path: Path) -> None:
    # Arrange
    root = tmp_path / "tree"
    nested = root / "child"
    nested.mkdir(parents=True)
    (nested / "file.txt").write_text("x", encoding="utf-8")
    file_path = tmp_path / "plain.txt"
    file_path.write_text("y", encoding="utf-8")
    missing = tmp_path / "missing"

    # Act
    macos._rmtree(root)
    macos._rmtree(file_path)
    macos._rmtree(missing)

    # Assert
    assert not root.exists()
    assert not file_path.exists()


def test_prepare_macos_handler_registers_ready_app(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    registered: list[Path] = []
    monkeypatch.setattr(macos, "_handler_app_ready", lambda *_a: True)
    monkeypatch.setattr(
        macos,
        "_register_handler_app",
        lambda app: registered.append(app),
    )

    # Act
    macos._prepare_macos_handler(tmp_path)

    # Assert
    assert registered == [tmp_path / macos.APP_NAME]


def test_capture_unlinks_stale_callback_file(tmp_path: Path) -> None:
    # Arrange
    stale = tmp_path / macos.CALLBACK_NAME
    stale.write_text("stale", encoding="utf-8")
    callback = f"{REDIRECT}/?state=s&code={LONG_CODE}"

    def open_url(_url: str) -> None:
        stale.write_text(callback, encoding="utf-8")

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
    assert result == callback
