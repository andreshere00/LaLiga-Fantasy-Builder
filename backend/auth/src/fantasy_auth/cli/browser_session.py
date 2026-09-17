"""Playwright helper: Keycloak login, JWT mint, optional pairing, API call."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from fantasy_auth.cli import authredirect_macos
from fantasy_auth.cli import helper as laliga_helper
from fantasy_auth.cli.pair import _create_pairing
from fantasy_auth.cli.session_analysis import (
    fetch_leagues_analysis,
    fetch_teams_analysis,
)

DEFAULT_AUTH_BASE = "http://localhost:8000"
DEFAULT_API_BASE = "http://localhost:8001"
DEFAULT_ORIGIN = "http://localhost:8000"
DEFAULT_USERNAME = "demo"
DEFAULT_PASSWORD = "demo"

LoginFn = Callable[[str, str, str, bool], tuple[str, str]]
CaptureFn = Callable[[str], str]


class BrowserSessionError(RuntimeError):
    """Local browser login or token exchange failed."""


def main(argv: list[str] | None = None) -> int:
    """Log in via Keycloak, mint a JWT, optionally pair, and call the API.

    App identity uses the local demo user (default ``demo``/``demo``). LaLiga
    pairing still needs one interactive B2C login when the vault has no link.

    Args:
        argv: Optional CLI arguments.

    Returns:
        Process exit code.
    """
    args = _parse_args(argv)
    try:
        _validate_analysis_args(args)
        session, csrf = _login(
            args.auth_base,
            args.username,
            args.password,
            headed=not args.headless,
        )
        jwt = exchange_token(
            auth_base=args.auth_base,
            origin=args.origin,
            session=session,
            csrf=csrf,
        )
        linked = _connection_linked(
            auth_base=args.auth_base,
            session=session,
            csrf=csrf,
        )
        needs_laliga = bool(args.player_id or args.flow)
        if needs_laliga and not linked:
            if args.no_pair:
                raise BrowserSessionError(
                    "LaLiga is not paired. Re-run without --no-pair, or "
                    "uv run pair-laliga with these session cookies.",
                )
            print(
                "LaLiga is not linked. Opening your browser for B2C login "
                "(Google sign-in is supported; authredirect:// is captured "
                "automatically)...",
                file=sys.stderr,
            )
            pair_laliga_with_playwright(
                auth_base=args.auth_base,
                origin=args.origin,
                session=session,
                csrf=csrf,
                headed=True,
            )
            jwt = exchange_token(
                auth_base=args.auth_base,
                origin=args.origin,
                session=session,
                csrf=csrf,
            )

        report: dict[str, Any] = {
            "session_ok": True,
            "linked": _connection_linked(
                auth_base=args.auth_base,
                session=session,
                csrf=csrf,
            ),
        }
        if args.flow == "leagues-analysis":
            report["leagues_analysis"] = _run_leagues_analysis(
                api_base=args.api_base,
                jwt=jwt,
                league_id=args.league_id,
                week=args.week,
                activity_page=args.activity_page,
                team_id=args.team_id,
            )
        elif args.flow == "teams-analysis":
            report["teams_analysis"] = _run_teams_analysis(
                api_base=args.api_base,
                jwt=jwt,
                team_id=args.team_id,
                league_id=args.league_id,
                week=args.week,
                put_lineup=args.put_lineup,
            )
        if args.player_id:
            report["league_player"] = _fetch_league_player(
                api_base=args.api_base,
                jwt=jwt,
                player_id=args.player_id,
                league_id=args.league_id,
            )
        if args.exports:
            _print_exports(session=session, csrf=csrf, jwt=jwt)
        if args.json or args.player_id or args.flow:
            printable = dict(report)
            if args.print_jwt:
                printable["access_token"] = jwt
            print(json.dumps(printable, ensure_ascii=False, indent=2))
        else:
            print(
                "Session ready. JWT minted. "
                f"LaLiga linked={report['linked']}. "
                "Pass --player-id, leagues-analysis, or teams-analysis.",
                file=sys.stderr,
            )
        return 0
    except BrowserSessionError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except httpx.HTTPError as exc:
        print(f"HTTP error: {exc}", file=sys.stderr)
        return 1


def exchange_token(
    *,
    auth_base: str,
    origin: str,
    session: str,
    csrf: str,
    transport: httpx.BaseTransport | None = None,
) -> str:
    """POST /auth/token and return the internal JWT.

    Args:
        auth_base: Auth service origin.
        origin: Origin header for CSRF.
        session: ``fantasy_session`` cookie.
        csrf: CSRF cookie and header.
        transport: Optional httpx transport (tests).

    Returns:
        Internal JWT string.

    Raises:
        BrowserSessionError: When exchange fails.
    """
    url = f"{auth_base.rstrip('/')}/auth/token"
    with httpx.Client(
        transport=transport,
        timeout=30.0,
        cookies={"fantasy_session": session, "fantasy_csrf": csrf},
    ) as client:
        response = client.post(
            url,
            headers={"Origin": origin, "X-CSRF-Token": csrf},
        )
    if not response.is_success:
        detail = _error_detail(response)
        raise BrowserSessionError(f"POST /auth/token failed: {detail}")
    token = response.json().get("access_token") if _is_object(response) else None
    if not token:
        raise BrowserSessionError("POST /auth/token missing access_token")
    return str(token)


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
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeout
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise BrowserSessionError(
            "Playwright is not installed. From backend/auth run:\n"
            "  uv sync --extra browser\n"
            "  uv run playwright install chromium",
        ) from exc

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
        except PlaywrightTimeout as exc:
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


def pair_laliga_with_playwright(
    *,
    auth_base: str,
    origin: str,
    session: str,
    csrf: str,
    headed: bool = True,
    capture_fn: CaptureFn | None = None,
) -> dict[str, Any]:
    """Create a pairing and complete PKCE by intercepting authredirect://.

    LaLiga B2C still needs an interactive sign-in. On macOS that happens in
    the default browser so Google login works. The native callback is captured
    automatically; nothing is pasted in the terminal.

    Args:
        auth_base: Auth service origin.
        origin: Origin header for CSRF.
        session: ``fantasy_session`` cookie.
        csrf: CSRF cookie and header.
        headed: When True, show a window for the Playwright fallback.
        capture_fn: Optional callback capture (tests). Receives the authorize URL.

    Returns:
        JSON body from POST /laliga/pairings/{id}/complete.

    Raises:
        BrowserSessionError: When pairing create, capture, or complete fails.
    """
    pairing = _create_pairing(
        api_base=auth_base,
        session=session,
        csrf=csrf,
        origin=origin,
    )
    if pairing is None:
        raise BrowserSessionError("Create pairing failed")
    print(
        f"Pairing created: {pairing['pairing_id']} "
        f"(expires_at={pairing['expires_at']})",
        file=sys.stderr,
    )
    pkce = laliga_helper.start_pkce_session(nonce=pairing["nonce"])
    capture = capture_fn or (
        lambda url: capture_authredirect(
            url,
            redirect_uri=pkce.redirect_uri,
            headed=headed,
        )
    )
    print(
        "Sign in to LaLiga in the browser window (Google is supported). "
        "Do not copy or paste the callback URL.",
        file=sys.stderr,
    )
    callback = capture(pkce.authorize_url)
    try:
        return laliga_helper.complete_pairing_from_callback(
            callback=callback,
            pairing_id=pairing["pairing_id"],
            secret=pairing["secret"],
            expected_state=pkce.state,
            verifier=pkce.verifier,
            redirect_uri=pkce.redirect_uri,
            api_base=auth_base,
            b2c=pkce.b2c,
        )
    except laliga_helper.PairingHelperError as exc:
        raise BrowserSessionError(str(exc)) from exc


def capture_authredirect(
    authorize_url: str,
    *,
    redirect_uri: str,
    headed: bool = True,
    timeout_ms: int = 180_000,
) -> str:
    """Capture the native B2C redirect without a terminal paste.

    On macOS this opens the default browser so Google sign-in works. If the
    helper app cannot be registered, Playwright Chrome/Chromium is used.

    Args:
        authorize_url: LaLiga B2C authorize URL (PKCE).
        redirect_uri: Expected ``authredirect://`` prefix.
        headed: When True, show a window for the Playwright fallback.
        timeout_ms: How long to wait for a complete callback.

    Returns:
        Full ``authredirect://`` callback URL including the authorization code.

    Raises:
        BrowserSessionError: When capture fails or times out.
    """
    if sys.platform == "darwin":
        try:
            return authredirect_macos.capture_authredirect_macos(
                authorize_url,
                redirect_uri=redirect_uri,
                timeout_ms=timeout_ms,
            )
        except authredirect_macos.AuthredirectTimeoutError as exc:
            raise BrowserSessionError(str(exc)) from exc
        except authredirect_macos.AuthredirectHandlerError as exc:
            print(
                f"macOS callback helper failed ({exc}). "
                "Falling back to Chrome; Google login may be blocked.",
                file=sys.stderr,
            )
    return capture_authredirect_with_playwright(
        authorize_url,
        redirect_uri=redirect_uri,
        headed=headed,
        timeout_ms=timeout_ms,
    )


def capture_authredirect_with_playwright(
    authorize_url: str,
    *,
    redirect_uri: str,
    headed: bool = True,
    timeout_ms: int = 180_000,
) -> str:
    """Open B2C authorize in Chrome/Chromium and capture the native redirect.

    Args:
        authorize_url: LaLiga B2C authorize URL (PKCE).
        redirect_uri: Expected ``authredirect://`` prefix.
        headed: When True, show the browser window.
        timeout_ms: How long to wait for a complete callback.

    Returns:
        Full ``authredirect://`` callback URL including the authorization code.

    Raises:
        BrowserSessionError: When Playwright is missing or capture times out.
    """
    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise BrowserSessionError(
            "Playwright is not installed. From backend/auth run:\n"
            "  uv sync --extra browser\n"
            "  uv run playwright install chromium",
        ) from exc

    captured: list[str] = []

    def consider(url: str | None) -> None:
        if not url or captured:
            return
        picked = laliga_helper.pick_complete_callback(
            url,
            redirect_uri=redirect_uri,
        )
        if picked:
            captured.append(picked)

    with sync_playwright() as playwright:
        browser = _launch_pairing_browser(playwright, headed=headed)
        try:
            context = browser.new_context()
            page = context.new_page()
            _attach_context_authredirect_listeners(context, consider)
            try:
                page.goto(authorize_url, wait_until="domcontentloaded")
            except PlaywrightError as exc:
                consider(str(exc))
                if not captured:
                    raise BrowserSessionError(
                        f"Failed to open LaLiga authorize URL: {exc}",
                    ) from exc
            deadline = time.monotonic() + timeout_ms / 1000
            while time.monotonic() < deadline and not captured:
                try:
                    context.wait_for_event("page", timeout=200)
                except PlaywrightError:
                    continue
        except PlaywrightError as exc:
            if captured:
                return captured[0]
            raise BrowserSessionError(
                "The pairing browser closed before the LaLiga callback arrived. "
                "Keep the window open until sign-in finishes.",
            ) from exc
        finally:
            browser.close()

    if not captured:
        raise BrowserSessionError(
            "Timed out waiting for LaLiga authredirect:// callback. "
            "Finish sign-in in the browser window before the pairing expires.",
        )
    print(
        f"Callback captured from Chromium ({len(captured[0])} chars)",
        file=sys.stderr,
    )
    return captured[0]


def _launch_pairing_browser(playwright: Any, *, headed: bool) -> Any:
    """Launch installed Chrome when possible; otherwise Playwright Chromium."""
    from playwright.sync_api import Error as PlaywrightError

    launch_kwargs: dict[str, Any] = {
        "headless": not headed,
        "args": ["--disable-blink-features=AutomationControlled"],
        "ignore_default_args": ["--enable-automation"],
    }
    try:
        return playwright.chromium.launch(channel="chrome", **launch_kwargs)
    except PlaywrightError:
        print(
            "Google Chrome not found; using Chromium "
            "(Google login is often blocked in this browser).",
            file=sys.stderr,
        )
        return playwright.chromium.launch(headless=not headed)


def _attach_context_authredirect_listeners(
    context: Any,
    consider: Callable[[str | None], None],
) -> None:
    """Attach authredirect listeners to current and future pages."""

    def attach(page: Any) -> None:
        _attach_authredirect_listeners(page, consider)

    context.on("page", attach)
    for page in context.pages:
        attach(page)


def _attach_authredirect_listeners(
    page: Any,
    consider: Callable[[str | None], None],
) -> None:
    """Subscribe to navigation and CDP events that may carry authredirect://."""
    page.on("request", lambda request: consider(request.url))
    page.on("requestfailed", lambda request: consider(request.url))
    page.on("framenavigated", lambda frame: consider(frame.url))

    def on_response(response: Any) -> None:
        consider(response.url)
        consider(response.headers.get("location"))

    page.on("response", on_response)
    try:
        cdp = page.context.new_cdp_session(page)
        cdp.send("Network.enable")
        cdp.send(
            "Fetch.enable",
            {"patterns": [{"urlPattern": "authredirect://*"}]},
        )

        def on_paused(params: dict[str, Any]) -> None:
            request = params.get("request") or {}
            consider(str(request.get("url") or ""))
            request_id = params.get("requestId")
            if not request_id:
                return
            try:
                cdp.send(
                    "Fetch.failRequest",
                    {"requestId": request_id, "errorReason": "Aborted"},
                )
            except Exception:
                return

        def on_sent(params: dict[str, Any]) -> None:
            request = params.get("request") or {}
            consider(str(request.get("url") or ""))
            redirect = params.get("redirectResponse") or {}
            consider(str(redirect.get("url") or ""))
            consider(_header_location(redirect.get("headers") or {}))

        def on_received(params: dict[str, Any]) -> None:
            response = params.get("response") or {}
            consider(str(response.get("url") or ""))
            consider(_header_location(response.get("headers") or {}))

        cdp.on("Fetch.requestPaused", on_paused)
        cdp.on("Network.requestWillBeSent", on_sent)
        cdp.on("Network.responseReceived", on_received)
    except Exception:
        return


def _header_location(headers: dict[str, Any]) -> str | None:
    """Read a Location header from a CDP header map."""
    for key, value in headers.items():
        if str(key).lower() == "location":
            return str(value)
    return None


def _login(
    auth_base: str,
    username: str,
    password: str,
    *,
    headed: bool,
    login_fn: LoginFn | None = None,
) -> tuple[str, str]:
    """Run Keycloak login (injectable for tests)."""
    fn = login_fn or login_with_playwright
    return fn(auth_base, username, password, headed)


def _connection_linked(
    *,
    auth_base: str,
    session: str,
    csrf: str,
    transport: httpx.BaseTransport | None = None,
) -> bool:
    """Return whether /laliga/connection reports a linked vault."""
    url = f"{auth_base.rstrip('/')}/laliga/connection"
    with httpx.Client(
        transport=transport,
        timeout=15.0,
        cookies={"fantasy_session": session, "fantasy_csrf": csrf},
    ) as client:
        response = client.get(url)
    if response.status_code == 401:
        raise BrowserSessionError("GET /laliga/connection unauthorized")
    if not response.is_success:
        raise BrowserSessionError(
            f"GET /laliga/connection failed: HTTP {response.status_code}",
        )
    data = response.json()
    return bool(isinstance(data, dict) and data.get("linked"))


def _fetch_league_player(
    *,
    api_base: str,
    jwt: str,
    player_id: str,
    league_id: str | None,
    transport: httpx.BaseTransport | None = None,
) -> Any:
    """GET /leagues then GET /players/{id}/league/{league_id}."""
    leagues = _api_get(api_base, "/leagues", jwt, transport=transport)
    resolved = league_id or _first_league_id(leagues)
    if not resolved:
        raise BrowserSessionError("No league id in GET /leagues; pass --league-id")
    pid = quote(str(player_id), safe="")
    lid = quote(str(resolved), safe="")
    path = f"/players/{pid}/league/{lid}"
    return _api_get(api_base, path, jwt, transport=transport)


def _run_leagues_analysis(
    *,
    api_base: str,
    jwt: str,
    league_id: str | None,
    week: int | None,
    activity_page: int,
    team_id: str | None,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    """Fetch the leagues analysis bundle via the local API."""
    try:
        return fetch_leagues_analysis(
            get_json=lambda path: _api_get(
                api_base, path, jwt, transport=transport
            ),
            league_filter=league_id,
            week=week,
            activity_page=activity_page,
            team_id=team_id,
        )
    except RuntimeError as exc:
        if isinstance(exc, BrowserSessionError):
            raise
        raise BrowserSessionError(str(exc)) from exc


def _run_teams_analysis(
    *,
    api_base: str,
    jwt: str,
    team_id: str | None,
    league_id: str | None,
    week: int | None,
    put_lineup: str | None,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    """Fetch the teams analysis bundle via the local API."""
    body = _load_put_lineup(put_lineup)
    try:
        return fetch_teams_analysis(
            get_json=lambda path: _api_get(
                api_base, path, jwt, transport=transport
            ),
            put_json=lambda path, payload: _api_put(
                api_base, path, jwt, payload, transport=transport
            ),
            team_id=team_id,
            league_filter=league_id,
            week=week,
            put_lineup_body=body,
        )
    except RuntimeError as exc:
        if isinstance(exc, BrowserSessionError):
            raise
        raise BrowserSessionError(str(exc)) from exc


def _validate_analysis_args(args: argparse.Namespace) -> None:
    """Reject analysis flags that would fail after pairing.

    Args:
        args: Parsed CLI namespace.

    Raises:
        BrowserSessionError: When PUT flags are incomplete or invalid.
    """
    team_id = args.team_id
    if team_id in {"YOUR_TEAM", "your_team", "<team-id>", "ID"}:
        raise BrowserSessionError(
            "--team-id looks like a placeholder. Omit it to use the team "
            "from GET /leagues, or pass your real Fantasy team id.",
        )
    if not args.put_lineup:
        return
    if not team_id:
        raise BrowserSessionError(
            "--put-lineup requires --team-id and a JSON file that exists. "
            "For a read-only report, omit --put-lineup.",
        )
    _load_put_lineup(args.put_lineup)


def _load_put_lineup(path: str | None) -> dict[str, Any] | None:
    """Load an optional lineup JSON file for PUT /teams/{id}/lineup."""
    if not path:
        return None
    file_path = Path(path)
    if not file_path.is_file():
        raise BrowserSessionError(
            f"Cannot read --put-lineup: {file_path} does not exist. "
            "Omit --put-lineup for money/lineup GETs, or pass a JSON object "
            "file with a full lineup body.",
        )
    try:
        payload = json.loads(file_path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise BrowserSessionError(f"Cannot read --put-lineup: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise BrowserSessionError(f"Invalid --put-lineup JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise BrowserSessionError("--put-lineup must be a JSON object")
    return payload


def _api_put(
    api_base: str,
    path: str,
    jwt: str,
    body: dict[str, Any],
    *,
    transport: httpx.BaseTransport | None = None,
) -> Any:
    """PUT a JSON body to a Fantasy Builder API path with the internal JWT."""
    url = f"{api_base.rstrip('/')}{path}"
    with httpx.Client(transport=transport, timeout=60.0) as client:
        response = client.put(
            url,
            headers={
                "Authorization": f"Bearer {jwt}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json=body,
        )
    if not response.is_success:
        raise BrowserSessionError(
            f"API PUT {path} failed: {_error_detail(response)}",
        )
    if not response.content:
        return {}
    try:
        return response.json()
    except json.JSONDecodeError as exc:
        raise BrowserSessionError(
            f"API PUT {path} returned non-JSON",
        ) from exc


def _first_league_id(payload: Any) -> str | None:
    """Extract the first league id from a /leagues payload."""
    items: list[Any]
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict) and isinstance(payload.get("leagues"), list):
        items = payload["leagues"]
    else:
        return None
    for item in items:
        if not isinstance(item, dict):
            continue
        value = item.get("id") or item.get("leagueId") or item.get("league_id")
        if value is not None:
            return str(value)
    return None


def _api_get(
    api_base: str,
    path: str,
    jwt: str,
    *,
    transport: httpx.BaseTransport | None = None,
) -> Any:
    """GET a Fantasy Builder API path with the internal JWT."""
    url = f"{api_base.rstrip('/')}{path}"
    with httpx.Client(transport=transport, timeout=60.0) as client:
        response = client.get(
            url,
            headers={"Authorization": f"Bearer {jwt}", "Accept": "application/json"},
        )
    if not response.is_success:
        raise BrowserSessionError(
            f"API {path} failed: {_error_detail(response)}",
        )
    return response.json()


def _print_exports(*, session: str, csrf: str, jwt: str) -> None:
    """Print shell exports for the minted session (stderr)."""
    print(f"export FANTASY_SESSION='{session}'", file=sys.stderr)
    print(f"export FANTASY_CSRF='{csrf}'", file=sys.stderr)
    print(f"export INTERNAL_JWT='{jwt}'", file=sys.stderr)


def _error_detail(response: httpx.Response) -> str:
    """Summarize an HTTP error body without leaking large payloads."""
    try:
        data = response.json()
    except json.JSONDecodeError:
        return f"HTTP {response.status_code}"
    if isinstance(data, dict):
        error = data.get("error") or ""
        detail = data.get("detail") or ""
        return f"HTTP {response.status_code} {error} {detail}".strip()
    return f"HTTP {response.status_code}"


def _is_object(response: httpx.Response) -> bool:
    """Return True when the response JSON is an object."""
    try:
        return isinstance(response.json(), dict)
    except json.JSONDecodeError:
        return False


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(
        description=(
            "Log in to local Keycloak with Playwright, mint an internal JWT, "
            "pair LaLiga if needed, and run optional API analysis flows."
        ),
    )
    parser.add_argument(
        "--auth-base",
        default=os.environ.get("FANTASY_AUTH_BASE", DEFAULT_AUTH_BASE),
    )
    parser.add_argument(
        "--api-base",
        default=os.environ.get("FANTASY_API_BASE", DEFAULT_API_BASE),
    )
    parser.add_argument(
        "--origin",
        default=os.environ.get("FANTASY_ORIGIN", DEFAULT_ORIGIN),
    )
    parser.add_argument(
        "--username",
        default=os.environ.get("KEYCLOAK_USERNAME", DEFAULT_USERNAME),
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("KEYCLOAK_PASSWORD", DEFAULT_PASSWORD),
    )
    parser.add_argument("--player-id", default=None)
    parser.add_argument("--league-id", default=None)
    parser.add_argument(
        "--headless",
        action="store_true",
        help=(
            "Run Keycloak Chromium without a window "
            "(LaLiga pairing still opens a window)"
        ),
    )
    parser.add_argument(
        "--no-pair",
        action="store_true",
        help="Do not start LaLiga pairing when the vault is empty",
    )
    parser.add_argument(
        "--exports",
        action="store_true",
        help="Print FANTASY_SESSION / FANTASY_CSRF / INTERNAL_JWT exports",
    )
    parser.add_argument(
        "--print-jwt",
        action="store_true",
        help="Include access_token in --json output",
    )
    parser.add_argument("--json", action="store_true")
    parser.set_defaults(
        flow=None,
        week=None,
        activity_page=0,
        team_id=None,
        put_lineup=None,
    )
    subparsers = parser.add_subparsers(dest="flow")
    leagues = subparsers.add_parser(
        "leagues-analysis",
        help="GET leagues, standing, activity, and squads",
    )
    _add_analysis_args(leagues, include_activity=True, include_team=True)
    teams = subparsers.add_parser(
        "teams-analysis",
        help="GET team money/lineup and optionally PUT lineup",
    )
    _add_analysis_args(teams, include_activity=False, include_team=True)
    teams.add_argument(
        "--put-lineup",
        default=None,
        help="JSON file for PUT /teams/{id}/lineup (requires --team-id)",
    )
    return parser.parse_args(argv)


def _positive_week(value: str) -> int:
    """Parse a matchweek number (must be >= 1)."""
    week = int(value)
    if week < 1:
        raise argparse.ArgumentTypeError("week must be >= 1")
    return week


def _add_analysis_args(
    parser: argparse.ArgumentParser,
    *,
    include_activity: bool,
    include_team: bool,
) -> None:
    """Register flags shared by analysis subcommands."""
    parser.add_argument("--league-id", default=None)
    parser.add_argument(
        "--week",
        type=_positive_week,
        default=None,
        help="Matchweek (>= 1). Default: infer from /leagues",
    )
    parser.add_argument("--json", action="store_true")
    if include_activity:
        parser.add_argument(
            "--activity-page",
            type=int,
            default=0,
            help="Activity page index (default: 0)",
        )
    if include_team:
        parser.add_argument(
            "--team-id",
            default=None,
            help="Team id for squad/money/lineup (default: from /leagues)",
        )


if __name__ == "__main__":
    raise SystemExit(main())
