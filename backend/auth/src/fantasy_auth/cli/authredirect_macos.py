"""Capture LaLiga ``authredirect://`` from the user's real macOS browser."""

from __future__ import annotations

import plistlib
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path

from fantasy_auth.cli import helper as laliga_helper

BUNDLE_ID = "local.laliga.fantasy.authredirect"
APP_NAME = "LaligaAuthredirect.app"
CALLBACK_NAME = "callback.txt"
STAMP_NAME = "handler.stamp"
LSREGISTER = (
    "/System/Library/Frameworks/CoreServices.framework/"
    "Frameworks/LaunchServices.framework/Support/lsregister"
)


class AuthredirectHandlerError(RuntimeError):
    """The macOS URL-handler app could not be installed or registered."""


class AuthredirectTimeoutError(RuntimeError):
    """Timed out waiting for the system-browser authredirect callback."""


def macos_support_dir() -> Path:
    """Return the per-user directory for the callback helper."""
    return Path.home() / "Library/Application Support/laliga-fantasy-builder"


def capture_authredirect_macos(
    authorize_url: str,
    *,
    redirect_uri: str,
    timeout_ms: int = 180_000,
    support_dir: Path | None = None,
    prepare_handler: Callable[[Path], None] | None = None,
    open_url: Callable[[str], None] | None = None,
    sleep: Callable[[float], None] = time.sleep,
    monotonic: Callable[[], float] = time.monotonic,
) -> str:
    """Open the default browser and wait for the native B2C redirect.

    Google login works here because the page runs in the user's real Chrome
    or Safari, not in Playwright Chromium.

    Args:
        authorize_url: LaLiga B2C authorize URL (PKCE).
        redirect_uri: Expected ``authredirect://`` prefix.
        timeout_ms: How long to wait for a complete callback.
        support_dir: Override for the helper app / callback file directory.
        prepare_handler: Optional installer (tests).
        open_url: Optional URL opener (tests).
        sleep: Sleep function (tests).
        monotonic: Clock function (tests).

    Returns:
        Full ``authredirect://`` callback URL including the authorization code.

    Raises:
        AuthredirectHandlerError: When the helper app cannot be registered.
        AuthredirectTimeoutError: When no complete callback arrives in time.
    """
    directory = support_dir or macos_support_dir()
    directory.mkdir(parents=True, exist_ok=True)
    callback_path = directory / CALLBACK_NAME
    if callback_path.exists():
        callback_path.unlink()
    prepare = prepare_handler or _prepare_macos_handler
    prepare(directory)
    opener = open_url or _open_macos_url
    print(
        "Opening your default browser for LaLiga sign-in (Google is supported).\n"
        "If macOS asks to open LaligaAuthredirect, choose Open.\n"
        "Do not copy or paste the callback URL.",
        file=sys.stderr,
    )
    opener(authorize_url)
    deadline = monotonic() + timeout_ms / 1000
    while monotonic() < deadline:
        picked = _read_complete_callback(callback_path, redirect_uri=redirect_uri)
        if picked:
            callback_path.unlink(missing_ok=True)
            print(
                f"Callback captured from system browser ({len(picked)} chars)",
                file=sys.stderr,
            )
            return picked
        sleep(0.2)
    raise AuthredirectTimeoutError(
        "Timed out waiting for LaLiga authredirect:// callback. "
        "Finish Google/LaLiga sign-in in your browser, and allow the "
        "LaligaAuthredirect helper if macOS prompts.",
    )


def _read_complete_callback(path: Path, *, redirect_uri: str) -> str | None:
    """Return a complete callback from disk when the helper has written one."""
    if not path.is_file():
        return None
    raw = path.read_text(encoding="utf-8").strip()
    return laliga_helper.pick_complete_callback(raw, redirect_uri=redirect_uri)


def _open_macos_url(url: str) -> None:
    """Open a URL in the default macOS browser."""
    try:
        subprocess.run(["open", url], check=True, capture_output=True, text=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise AuthredirectHandlerError(f"Failed to open browser: {exc}") from exc


def _prepare_macos_handler(support_dir: Path) -> None:
    """Compile and register the authredirect:// helper app."""
    callback_path = support_dir / CALLBACK_NAME
    app_path = support_dir / APP_NAME
    if not _handler_app_ready(app_path, callback_path):
        _compile_handler_app(app_path, callback_path)
    _register_handler_app(app_path)


def _handler_app_ready(app_path: Path, callback_path: Path) -> bool:
    """Return whether the helper app exists and points at this callback file."""
    plist_path = app_path / "Contents" / "Info.plist"
    stamp_path = app_path.parent / STAMP_NAME
    if not plist_path.is_file() or not stamp_path.is_file():
        return False
    try:
        with plist_path.open("rb") as handle:
            info = plistlib.load(handle)
        stamp = stamp_path.read_text(encoding="utf-8").strip()
    except (OSError, plistlib.InvalidFileException):
        return False
    if info.get("CFBundleIdentifier") != BUNDLE_ID:
        return False
    return stamp == str(callback_path.expanduser().resolve())


def _compile_handler_app(app_path: Path, callback_path: Path) -> None:
    """Build an AppleScript applet that writes authredirect URLs to disk."""
    support_dir = app_path.parent
    support_dir.mkdir(parents=True, exist_ok=True)
    source = support_dir / "authredirect_handler.applescript"
    source.write_text(_applescript_source(callback_path), encoding="utf-8")
    if app_path.exists():
        _rmtree(app_path)
    try:
        subprocess.run(
            ["osacompile", "-o", str(app_path), str(source)],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        detail = exc.stderr if isinstance(exc, subprocess.CalledProcessError) else exc
        raise AuthredirectHandlerError(
            f"osacompile failed: {detail}",
        ) from exc
    _patch_handler_plist(app_path)
    stamp = app_path.parent / STAMP_NAME
    stamp.write_text(str(callback_path.expanduser().resolve()), encoding="utf-8")
    try:
        subprocess.run(
            ["codesign", "--force", "-s", "-", str(app_path)],
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return


def _applescript_source(callback_path: Path) -> str:
    """AppleScript that stores an ``open location`` URL on disk.

    Args:
        callback_path: Destination file for the callback URL.

    Returns:
        AppleScript source.
    """
    posix = callback_path.expanduser().resolve()
    if '"' in str(posix):
        raise AuthredirectHandlerError("Callback path contains a quote")
    return (
        "on open location theURL\n"
        f'    set posixPath to "{posix}"\n'
        "    set theFile to POSIX file posixPath\n"
        "    set fd to open for access theFile with write permission\n"
        "    set eof of fd to 0\n"
        "    write theURL to fd as «class utf8»\n"
        "    close access fd\n"
        "end open location\n"
        "on run\n"
        "end run\n"
    )


def _patch_handler_plist(app_path: Path) -> None:
    """Declare the authredirect URL scheme on the compiled applet."""
    plist_path = app_path / "Contents" / "Info.plist"
    with plist_path.open("rb") as handle:
        info = plistlib.load(handle)
    info["CFBundleIdentifier"] = BUNDLE_ID
    info["LSUIElement"] = True
    info["CFBundleURLTypes"] = [
        {
            "CFBundleURLName": "LaLiga Fantasy PKCE callback",
            "CFBundleURLSchemes": ["authredirect"],
        }
    ]
    with plist_path.open("wb") as handle:
        plistlib.dump(info, handle)


def _register_handler_app(app_path: Path) -> None:
    """Register the helper with Launch Services."""
    try:
        subprocess.run(
            [LSREGISTER, "-f", str(app_path)],
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError as exc:
        raise AuthredirectHandlerError(f"lsregister failed: {exc}") from exc


def _rmtree(path: Path) -> None:
    """Remove a directory tree."""
    if not path.exists():
        return
    if path.is_file() or path.is_symlink():
        path.unlink()
        return
    for child in path.iterdir():
        _rmtree(child)
    path.rmdir()
