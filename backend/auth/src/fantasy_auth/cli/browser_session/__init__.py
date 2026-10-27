"""Playwright helper: Better Auth login, application JWT, optional pairing, API call."""

from __future__ import annotations

import json
import sys
from typing import Any

import httpx
from pydantic import ValidationError

from fantasy_auth.api.schemas import LinkOptionsResponse
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
    run_lineup_builder_analysis,
    run_market_analysis,
    run_standings_analysis,
    run_teams_analysis,
)
from fantasy_auth.cli.browser_session.http import connection_linked
from fantasy_auth.cli.browser_session.identity import login_with_playwright
from fantasy_auth.cli.browser_session.pairing import pair_laliga_with_playwright

# Back-compat aliases used by CLI tests that patch this package.
_connection_linked = connection_linked
_fetch_league_player = fetch_league_player
_run_leagues_analysis = run_leagues_analysis
_run_teams_analysis = run_teams_analysis
_run_market_analysis = run_market_analysis
_run_buyout_analysis = run_buyout_analysis
_run_standings_analysis = run_standings_analysis


def main(argv: list[str] | None = None) -> int:
    """Sign in interactively, optionally pair LaLiga, and run read analyses."""
    args = parse_args(argv)
    try:
        jwt, linked = _bootstrap(args)
        report = _run_requested(args, jwt=jwt, linked=linked)
        _render(args, report, jwt=jwt)
        return 0
    except BrowserSessionError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except httpx.HTTPError as exc:
        print(f"HTTP error: {exc}", file=sys.stderr)
        return 1


def _bootstrap(args: Any) -> tuple[str, bool]:
    """Get an application token and pair only when the selected read needs LaLiga."""
    validate_analysis_args(args)
    jwt = args.jwt or login_with_playwright(args.auth_base, headed=not args.headless)
    if args.pair_only:
        _confirm_account(args.auth_base, jwt)
    linked = False
    if needs_laliga(args):
        linked = _connection_linked(auth_base=args.auth_base, jwt=jwt)
        if not linked:
            if args.no_pair:
                raise BrowserSessionError("LaLiga is not paired. Re-run without --no-pair.")
            pair_laliga_with_playwright(auth_base=args.auth_base, jwt=jwt, headed=True)
            linked = _connection_linked(auth_base=args.auth_base, jwt=jwt)
    return jwt, linked


def _confirm_account(auth_base: str, jwt: str) -> None:
    """Confirm the server-verified application owner before LaLiga authorization."""
    try:
        with httpx.Client(timeout=15, follow_redirects=False) as client:
            response = client.get(
                f"{auth_base.rstrip('/')}/laliga/link-options",
                headers={"Authorization": f"Bearer {jwt}"},
            )
        response.raise_for_status()
        account = LinkOptionsResponse.model_validate(response.json())
    except (httpx.HTTPError, ValueError, ValidationError):
        raise BrowserSessionError(
            "Could not verify your Fantasy Builder account. Check HTTPS and try again."
        ) from None
    label = account.email or account.name or account.user_id
    print(f"Fantasy Builder account: {label} (ID: {account.user_id})", file=sys.stderr)
    try:
        answer = input("Is this the account open in your website tab? Type yes to continue: ")
    except (EOFError, KeyboardInterrupt):
        raise BrowserSessionError("Connection cancelled before LaLiga authorization") from None
    if answer.strip().lower() != "yes":
        raise BrowserSessionError("Connection cancelled. Sign in with the matching account.")


def _run_requested(args: Any, *, jwt: str, linked: bool) -> dict[str, Any]:
    """Run the selected API flow and return the JSON report."""
    report: dict[str, Any] = {"session_ok": True, "linked": linked}
    if args.flow == "lineup-builder-analysis":
        report["lineup_builder_analysis"] = run_lineup_builder_analysis(
            api_base=args.api_base,
            jwt=jwt,
            league_id=args.league_id,
            preferences_file=getattr(args, "preferences_file", None),
        )
    elif args.flow == "leagues-analysis":
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
            player_team_id=args.player_team_id,
        )
    elif args.flow == "standings-analysis":
        report["standings_analysis"] = _run_standings_analysis(
            api_base=args.api_base,
            jwt=jwt,
            competition_id=args.competition_id,
            season=args.season,
            mode=args.mode,
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
    jwt: str,
) -> None:
    """Print JSON, exports, or a short ready message."""
    if args.exports:
        print(f"export INTERNAL_JWT='{jwt}'", file=sys.stderr)
    if args.json or args.player_id or args.flow:
        printable = dict(report)
        if args.print_jwt:
            printable["access_token"] = jwt
        print(json.dumps(printable, ensure_ascii=False, indent=2))
        return
    if args.pair_only:
        print(
            "LaLiga connection verified. Return to https://fantasybuilder.es/connect-laliga "
            "and choose Check connection.",
            file=sys.stderr,
        )
        return
    print(
        "Session ready. JWT minted. "
        f"LaLiga linked={report['linked']}. "
        "Pass --player-id, leagues-analysis, teams-analysis, market-analysis, "
        "buyout-analysis, or standings-analysis.",
        file=sys.stderr,
    )
