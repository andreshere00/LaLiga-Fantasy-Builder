"""CLI to fetch LaLiga Fantasy team money and lineup via the local API."""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

import httpx

from fantasy_api.cli.common import (
    api_get,
    as_league_list,
    exchange_token,
    league_id,
    my_team_id,
    normalize,
    path_segment,
)


def _parse_week(value: str) -> int:
    """Parse a matchweek number (must be >= 1)."""
    week = int(value)
    if week < 1:
        raise argparse.ArgumentTypeError("week must be >= 1")
    return week


def main(argv: list[str] | None = None) -> int:
    """Exchange session cookies for a JWT and print team money/lineup.

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
            "LaLiga Fantasy Builder — team money, current lineup, and "
            "optional week lineup via the local API"
        ),
    )
    parser.add_argument(
        "--auth-base",
        default=os.environ.get("FANTASY_AUTH_BASE", "http://localhost:8000"),
        help="Auth service base URL",
    )
    parser.add_argument(
        "--api-base",
        default=os.environ.get("FANTASY_API_BASE", "http://localhost:8001"),
        help="Fantasy Builder API base URL",
    )
    parser.add_argument(
        "--session",
        default=os.environ.get("FANTASY_SESSION") or os.environ.get("SESSION"),
        help="fantasy_session cookie (or env FANTASY_SESSION)",
    )
    parser.add_argument(
        "--csrf",
        default=os.environ.get("FANTASY_CSRF") or os.environ.get("CSRF"),
        help="CSRF token (or env FANTASY_CSRF)",
    )
    parser.add_argument(
        "--jwt",
        default=os.environ.get("INTERNAL_JWT"),
        help="Internal JWT (skips /auth/token when set)",
    )
    parser.add_argument(
        "--origin",
        default=os.environ.get("FANTASY_ORIGIN", "http://localhost:3000"),
        help="Origin header for auth CSRF checks",
    )
    parser.add_argument(
        "--team-id",
        default=None,
        help="Fantasy team id (default: resolve from /leagues)",
    )
    parser.add_argument(
        "--league-id",
        default=None,
        help="When resolving team id, only use this league",
    )
    parser.add_argument(
        "--week",
        type=_parse_week,
        default=None,
        help="Also fetch lineup for this matchweek (>= 1)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print raw aggregated JSON instead of a text summary",
    )
    args = parser.parse_args(argv)

    jwt = normalize(args.jwt)
    if not jwt:
        session = normalize(args.session)
        csrf = normalize(args.csrf)
        if not session or not csrf:
            print(
                "Missing credentials. Provide --jwt / INTERNAL_JWT, or:\n"
                "  export FANTASY_SESSION='…'\n"
                "  export FANTASY_CSRF='…'\n"
                "Then re-run: uv run fantasy-teams",
                file=sys.stderr,
            )
            return 1
        token = exchange_token(
            auth_base=args.auth_base,
            session=session,
            csrf=csrf,
            origin=args.origin,
        )
        if token is None:
            return 1
        jwt = token

    try:
        report = _build_report(
            api_base=args.api_base,
            jwt=jwt,
            team_id=args.team_id,
            league_id=args.league_id,
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
    team_id: str | None,
    league_id: str | None,
    week: int | None,
) -> dict[str, Any]:
    """Fetch money and lineup for one or more teams."""
    targets = _resolve_targets(
        api_base=api_base,
        jwt=jwt,
        team_id=team_id,
        league_filter=league_id,
    )
    team_reports: list[dict[str, Any]] = []
    for target in targets:
        tid = path_segment(target["team_id"])
        money = api_get(api_base, f"/teams/{tid}/money", jwt)
        lineup = api_get(api_base, f"/teams/{tid}/lineup", jwt)
        week_lineup = None
        if week is not None:
            week_lineup = api_get(
                api_base,
                f"/teams/{tid}/lineup/week/{week}",
                jwt,
            )
        team_reports.append(
            {
                "team_id": target["team_id"],
                "league_id": target.get("league_id"),
                "league_name": target.get("league_name"),
                "money": money,
                "lineup": lineup,
                "week": week,
                "week_lineup": week_lineup,
            }
        )
    return {"teams": team_reports}


def _resolve_targets(
    *,
    api_base: str,
    jwt: str,
    team_id: str | None,
    league_filter: str | None,
) -> list[dict[str, Any]]:
    """Resolve team targets from --team-id or GET /leagues."""
    if team_id is not None:
        return [{"team_id": team_id, "league_id": league_filter, "league_name": None}]

    leagues_payload = api_get(api_base, "/leagues", jwt)
    leagues = as_league_list(leagues_payload)
    if league_filter:
        leagues = [item for item in leagues if str(league_id(item)) == str(league_filter)]
        if not leagues:
            raise RuntimeError(f"League id {league_filter!r} not found in /leagues")

    targets: list[dict[str, Any]] = []
    for item in leagues:
        tid = my_team_id(item)
        if tid is None:
            continue
        targets.append(
            {
                "team_id": tid,
                "league_id": league_id(item),
                "league_name": item.get("name") or item.get("leagueName"),
            }
        )
    if not targets:
        raise RuntimeError(
            "No team id found. Pass --team-id, or ensure /leagues embeds team.id",
        )
    return targets


def _print_report(report: dict[str, Any]) -> None:
    """Print a human-readable teams money/lineup report."""
    teams = report.get("teams") or []
    if not teams:
        print("No teams found.")
        return

    for entry in teams:
        print("=" * 60)
        league_label = entry.get("league_name") or entry.get("league_id")
        if league_label is not None:
            print(f"League: {league_label} (id={entry.get('league_id')})")
        print(f"Team id: {entry.get('team_id')}")
        _print_money(entry.get("money"))
        print("  Current lineup:")
        _print_lineup(entry.get("lineup"))
        week = entry.get("week")
        if week is None:
            print("  Week lineup: skipped (pass --week N to fetch)")
        else:
            print(f"  Week {week} lineup:")
            _print_lineup(entry.get("week_lineup"))
        print()


def _print_money(money: Any) -> None:
    """Print cash and investment fields."""
    if not isinstance(money, dict) or not money:
        print("  Money: (empty — own team usually has teamMoney/teamInvestment)")
        return
    cash = money.get("teamMoney")
    investment = money.get("teamInvestment")
    print(f"  Money: teamMoney={cash}  teamInvestment={investment}")


def _print_lineup(lineup: Any) -> None:
    """Print a short lineup / formation summary."""
    if not isinstance(lineup, dict) or not lineup:
        print("    (empty)")
        return
    formation = lineup.get("formation")
    if isinstance(formation, dict):
        tactical = formation.get("tacticalFormation") or formation.get(
            "tactical_formation",
        )
        if tactical is not None:
            print(f"    Formation: {_format_formation(tactical)}")
        for line in ("goalkeeper", "defender", "midfield", "striker"):
            slots = formation.get(line)
            if slots is None:
                continue
            print(f"    {line}: {_slot_summary(slots)}")
        captain = formation.get("captain")
        if captain is not None:
            print(f"    captain: {captain}")
        coach = formation.get("coach")
        if coach is not None:
            print(f"    coach: {_slot_summary(coach)}")
        return
    # Flat PUT-shaped or unknown payload
    tactical = lineup.get("tacticalFormation") or lineup.get("tactical_formation")
    if tactical is not None:
        print(f"    Formation: {_format_formation(tactical)}")
    for line in ("goalkeeper", "defender", "midfield", "striker"):
        if line in lineup:
            print(f"    {line}: {_slot_summary(lineup.get(line))}")
    if not any(
        key in lineup
        for key in (
            "formation",
            "goalkeeper",
            "tacticalFormation",
            "tactical_formation",
        )
    ):
        print(f"    (fetched; use --json for full body: {list(lineup)[:8]}…)")


def _format_formation(value: Any) -> str:
    """Format a tactical formation list as D-M-F."""
    if isinstance(value, list) and all(isinstance(item, int) for item in value):
        return "-".join(str(item) for item in value)
    return str(value)


def _slot_summary(value: Any) -> str:
    """Summarize a lineup slot (id, list of ids, or player objects)."""
    if value is None:
        return "(none)"
    if isinstance(value, list):
        if not value:
            return "[]"
        parts: list[str] = []
        for item in value[:8]:
            parts.append(_slot_label(item))
        suffix = f" …(+{len(value) - 8})" if len(value) > 8 else ""
        return "[" + ", ".join(parts) + "]" + suffix
    return _slot_label(value)


def _slot_label(value: Any) -> str:
    """Return a short label for one lineup slot entry."""
    if isinstance(value, dict):
        player = value.get("playerMaster")
        if isinstance(player, dict):
            name = player.get("nickname") or player.get("name")
            if name:
                return str(name)
        for key in ("playerTeamId", "id", "nickname", "name"):
            if value.get(key) is not None:
                return str(value[key])
        return "{…}"
    return str(value)


if __name__ == "__main__":
    raise SystemExit(main())
