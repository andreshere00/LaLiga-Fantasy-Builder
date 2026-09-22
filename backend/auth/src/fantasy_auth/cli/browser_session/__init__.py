"""Playwright helper: Keycloak login, JWT mint, optional pairing, API call."""

from __future__ import annotations

import json
import sys
from typing import Any

import httpx

from fantasy_auth.cli.browser_session.args import (
    needs_laliga,
    parse_args,
    validate_analysis_args,
)
from fantasy_auth.cli.browser_session.errors import BrowserSessionError
from fantasy_auth.cli.browser_session.flows import (
    fetch_league_player,
    run_buyout_analysis,
    run_leagues_analysis,
    run_market_analysis,
    run_teams_analysis,
)
from fantasy_auth.cli.browser_session.http import connection_linked, exchange_token
from fantasy_auth.cli.browser_session.keycloak import login_with_playwright
from fantasy_auth.cli.browser_session.pairing import pair_laliga_with_playwright

# Back-compat aliases used by CLI tests that patch this package.
_connection_linked = connection_linked
_fetch_league_player = fetch_league_player
_run_leagues_analysis = run_leagues_analysis
_run_teams_analysis = run_teams_analysis
_run_market_analysis = run_market_analysis
_run_buyout_analysis = run_buyout_analysis


def main(argv: list[str] | None = None) -> int:
    """Log in via Keycloak, mint a JWT, optionally pair, and call the API.

    App identity uses the local demo user (default ``demo``/``demo``). LaLiga
    pairing still needs one interactive B2C login when the vault has no link.

    Args:
        argv: Optional CLI arguments.

    Returns:
        Process exit code.
    """
    args = parse_args(argv)
    try:
        session, csrf, jwt, linked = _bootstrap(args)
        report = _run_requested(args, jwt=jwt, linked=linked)
        _render(args, report, session=session, csrf=csrf, jwt=jwt)
        return 0
    except BrowserSessionError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except httpx.HTTPError as exc:
        print(f"HTTP error: {exc}", file=sys.stderr)
        return 1


def _bootstrap(args: Any) -> tuple[str, str, str, bool]:
    """Log in, mint a JWT, and pair LaLiga when the selected flow needs it."""
    validate_analysis_args(args)
    session, csrf = login_with_playwright(
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
    if needs_laliga(args) and not linked:
        jwt, linked = _pair_if_needed(args, session=session, csrf=csrf)
    return session, csrf, jwt, linked


def _pair_if_needed(args: Any, *, session: str, csrf: str) -> tuple[str, bool]:
    """Run pairing when the vault is empty and pairing is allowed."""
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
    linked = _connection_linked(
        auth_base=args.auth_base,
        session=session,
        csrf=csrf,
    )
    return jwt, linked


def _run_requested(args: Any, *, jwt: str, linked: bool) -> dict[str, Any]:
    """Run the selected API flow and return the JSON report."""
    report: dict[str, Any] = {"session_ok": True, "linked": linked}
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
    elif args.flow == "market-analysis":
        report["market_analysis"] = _run_market_analysis(
            api_base=args.api_base,
            jwt=jwt,
            league_id=args.league_id,
            player_team_id=getattr(args, "player_team_id", None),
        )
    elif args.flow == "buyout-analysis":
        report["buyout_analysis"] = _run_buyout_analysis(
            api_base=args.api_base,
            jwt=jwt,
            league_id=args.league_id,
            player_team_id=getattr(args, "player_team_id", None),
        )
    if args.player_id:
        report["league_player"] = _fetch_league_player(
            api_base=args.api_base,
            jwt=jwt,
            player_id=args.player_id,
            league_id=args.league_id,
        )
    return report


def _render(
    args: Any,
    report: dict[str, Any],
    *,
    session: str,
    csrf: str,
    jwt: str,
) -> None:
    """Print JSON, exports, or a short ready message."""
    if args.exports:
        print(f"export FANTASY_SESSION='{session}'", file=sys.stderr)
        print(f"export FANTASY_CSRF='{csrf}'", file=sys.stderr)
        print(f"export INTERNAL_JWT='{jwt}'", file=sys.stderr)
    if args.json or args.player_id or args.flow:
        printable = dict(report)
        if args.print_jwt:
            printable["access_token"] = jwt
        print(json.dumps(printable, ensure_ascii=False, indent=2))
        return
    print(
        "Session ready. JWT minted. "
        f"LaLiga linked={report['linked']}. "
        "Pass --player-id, leagues-analysis, teams-analysis, market-analysis, "
        "or buyout-analysis.",
        file=sys.stderr,
    )
