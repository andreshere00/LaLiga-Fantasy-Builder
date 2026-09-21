"""CLI to fetch matchday calendar and stats via the local API."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import httpx

from fantasy_api.cli.common import add_common_cli_args, api_get, resolve_jwt


def _parse_week(value: str) -> int:
    """Parse a matchweek number (must be >= 1)."""
    week = int(value)
    if week < 1:
        raise argparse.ArgumentTypeError("week must be >= 1")
    return week


def main(argv: list[str] | None = None) -> int:
    """Exchange session cookies for a JWT and print calendar summaries.

    Environment (optional if flags are set):
        FANTASY_SESSION / FANTASY_CSRF — auth session cookies
        INTERNAL_JWT — skip token exchange when already minted
        FANTASY_AUTH_BASE — auth origin (default ``http://localhost:8000``)
        FANTASY_API_BASE — Fantasy Builder API origin
            (default ``http://localhost:8001``)

    Args:
        argv: Optional CLI arguments.

    Returns:
        Process exit code.
    """
    parser = argparse.ArgumentParser(
        description=(
            "LaLiga Fantasy Builder — current matchday, fixtures, and "
            "matchweek stats via the local API"
        ),
    )
    add_common_cli_args(parser)
    parser.add_argument(
        "--week",
        type=_parse_week,
        default=None,
        help="Matchweek (default: current.weekNumber from /calendar/current)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print raw aggregated JSON instead of a text summary",
    )
    args = parser.parse_args(argv)

    jwt = resolve_jwt(args, command="fantasy-calendar")
    if jwt is None:
        return 1

    try:
        report = _build_report(
            api_base=args.api_base,
            jwt=jwt,
            week=args.week,
        )
    except httpx.HTTPError as exc:
        print(f"HTTP error: {exc}", file=sys.stderr)
        return 1
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        _print_report(report)
    return 0


def _build_report(
    *,
    api_base: str,
    jwt: str,
    week: int | None,
) -> dict[str, Any]:
    """Fetch current week, fixtures, and stats for the selected matchday."""
    current = api_get(api_base, "/calendar/current", jwt)
    week_number = week
    if week_number is None:
        raw_week = current.get("weekNumber")
        if raw_week is None:
            raise RuntimeError("Could not infer week from /calendar/current")
        week_number = int(raw_week)

    fixtures = api_get(api_base, f"/calendar/weeks/{week_number}", jwt)
    stats = api_get(api_base, f"/calendar/weeks/{week_number}/stats", jwt)
    return {
        "week": week_number,
        "current": current,
        "fixtures": fixtures,
        "stats": stats,
    }


def _print_matchday_window(current: dict[str, Any]) -> None:
    """Print opening/closing dates and live flag for a matchday object."""
    opening = current.get("openingWeekDate")
    closing = current.get("closingWeekDate")
    if opening or closing:
        print(f"  Window: {opening or '?'} → {closing or '?'}")
    if current.get("isLive"):
        print("  Status: live")


def _print_report(report: dict[str, Any]) -> None:
    """Print a human-readable calendar summary."""
    week = report["week"]
    current = report["current"]
    raw_current_week = current.get("weekNumber")
    current_week = int(raw_current_week) if raw_current_week is not None else None
    same_week = current_week is not None and week == current_week

    print(f"Matchweek {week}")
    if same_week:
        _print_matchday_window(current)
    elif current_week is not None:
        print(f"\nCurrent matchday (week {current_week}):")
        _print_matchday_window(current)

    fixtures = report.get("fixtures") or []
    print(f"\nFixtures ({len(fixtures)}):")
    for match in fixtures:
        local_id = match.get("localId", "?")
        visitor_id = match.get("visitorId", "?")
        local_score = match.get("localScore")
        visitor_score = match.get("visitorScore")
        if local_score is None or visitor_score is None:
            score = "vs"
        else:
            score = f"{local_score}-{visitor_score}"
        when = match.get("matchDate") or match.get("date") or "?"
        print(f"  {when}: {local_id} {score} {visitor_id}")

    stats = report.get("stats") or []
    print(f"\nStats matches: {len(stats)}")
