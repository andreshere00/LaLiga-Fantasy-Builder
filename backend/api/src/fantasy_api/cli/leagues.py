"""CLI to fetch LaLiga Fantasy leagues, ranking, and related resources."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import httpx

from fantasy_api.cli.common import (
    add_common_cli_args,
    api_get,
    as_league_list,
    league_id,
    my_team_id,
    resolve_jwt,
)


def main(argv: list[str] | None = None) -> int:
    """Exchange session cookies for a JWT and print leagues summaries.

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
            "LaLiga Fantasy Builder — list leagues, ranking/position, "
            "week standing, activity, and teams via the local API"
        ),
    )
    add_common_cli_args(parser)
    parser.add_argument(
        "--league-id",
        default=None,
        help="Only process this league id (default: all leagues)",
    )
    parser.add_argument(
        "--week",
        type=int,
        default=None,
        help="Matchweek for week standing (default: infer última jornada)",
    )
    parser.add_argument(
        "--activity-page",
        type=int,
        default=0,
        help="Activity page index (default: 0)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print raw aggregated JSON instead of a text summary",
    )
    args = parser.parse_args(argv)

    jwt = resolve_jwt(args, command="fantasy-leagues")
    if jwt is None:
        return 1

    try:
        report = _build_report(
            api_base=args.api_base,
            jwt=jwt,
            league_filter=args.league_id,
            week=args.week,
            activity_page=args.activity_page,
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
    league_filter: str | None,
    week: int | None,
    activity_page: int,
) -> dict[str, Any]:
    """Fetch leagues and per-league detail payloads."""
    leagues_payload = api_get(api_base, "/leagues", jwt)
    leagues = as_league_list(leagues_payload)
    if league_filter:
        leagues = [item for item in leagues if str(league_id(item)) == str(league_filter)]
        if not leagues:
            raise RuntimeError(f"League id {league_filter!r} not found in /leagues")

    league_reports: list[dict[str, Any]] = []
    for item in leagues:
        lid = league_id(item)
        if lid is None:
            continue
        lid_str = str(lid)
        standing = api_get(api_base, f"/leagues/{lid_str}/standing", jwt)
        inferred_week = week if week is not None else _infer_week(item, standing)
        week_standing = None
        if inferred_week is not None:
            week_standing = api_get(
                api_base,
                f"/leagues/{lid_str}/standing/{inferred_week}",
                jwt,
            )
        activity = api_get(
            api_base,
            f"/leagues/{lid_str}/activity/{activity_page}",
            jwt,
        )
        teams = api_get(api_base, f"/leagues/{lid_str}/teams", jwt)
        team_id = my_team_id(item)
        my_team = None
        if team_id is not None:
            my_team = api_get(
                api_base,
                f"/leagues/{lid_str}/teams/{team_id}",
                jwt,
            )
        league_reports.append(
            {
                "league_id": lid,
                "league": item,
                "summary": _league_summary(item, standing),
                "standing": standing,
                "week": inferred_week,
                "week_standing": week_standing,
                "activity_page": activity_page,
                "activity": activity,
                "teams": teams,
                "my_team_id": team_id,
                "my_team": my_team,
            }
        )

    return {"leagues": league_reports}


def _infer_week(league: dict[str, Any], standing: Any) -> int | None:
    """Infer the current/last matchweek from league or standing payloads."""
    for source in (league, standing if isinstance(standing, dict) else {}):
        for key in (
            "week",
            "currentWeek",
            "current_week",
            "gameweek",
            "jornada",
            "lastWeek",
            "last_week",
        ):
            value = source.get(key) if isinstance(source, dict) else None
            if isinstance(value, int):
                return value
            if isinstance(value, str) and value.isdigit():
                return int(value)
    return None


def _league_summary(league: dict[str, Any], standing: Any) -> dict[str, Any]:
    """Build a compact ranking summary for the caller's team."""
    team_id = my_team_id(league)
    team = league.get("team") if isinstance(league.get("team"), dict) else {}
    name = (team or {}).get("name") or league.get("teamName") or league.get("name") or "unknown"
    position = _find_position(standing, team_id)
    points = None
    if isinstance(team, dict):
        points = team.get("points") or team.get("livePoints")
    if position and position.get("points") is not None:
        points = position.get("points")
    return {
        "league_name": league.get("name") or league.get("leagueName"),
        "team_id": team_id,
        "team_name": name if isinstance(name, str) else str(name),
        "position": None if position is None else position.get("rank"),
        "points": points,
        "standing_entry": position,
    }


def _find_position(standing: Any, team_id: Any) -> dict[str, Any] | None:
    """Locate the caller's row in a standing payload."""
    rows = _standing_rows(standing)
    if team_id is None:
        return None
    for index, row in enumerate(rows, start=1):
        raw_team = row.get("team")
        team: dict[str, Any] = raw_team if isinstance(raw_team, dict) else {}
        row_team_id = row.get("teamId") or row.get("team_id") or team.get("id") or row.get("id")
        if row_team_id is not None and str(row_team_id) == str(team_id):
            rank = row.get("position") or row.get("rank") or index
            points = row.get("points") or row.get("livePoints")
            return {
                "rank": rank,
                "points": points,
                "row": row,
            }
    return None


def _standing_rows(standing: Any) -> list[dict[str, Any]]:
    """Normalize standing payload to a list of rank rows."""
    if isinstance(standing, list):
        return [row for row in standing if isinstance(row, dict)]
    if isinstance(standing, dict):
        for key in ("standing", "standings", "teams", "ranking", "data"):
            nested = standing.get(key)
            if isinstance(nested, list):
                return [row for row in nested if isinstance(row, dict)]
    return []


def _print_report(report: dict[str, Any]) -> None:
    """Print a human-readable leagues report."""
    leagues = report.get("leagues") or []
    if not leagues:
        print("No leagues found.")
        return

    for entry in leagues:
        summary = entry.get("summary") or {}
        print("=" * 60)
        print(
            f"League: {summary.get('league_name') or entry.get('league_id')} "
            f"(id={entry.get('league_id')})"
        )
        print(f"  My team: {summary.get('team_name')} " f"(id={summary.get('team_id')})")
        print(f"  Position: {summary.get('position')}  " f"Points: {summary.get('points')}")
        print("  Overall standing:")
        _print_standing(entry.get("standing"), highlight_team_id=summary.get("team_id"))
        week = entry.get("week")
        if week is None:
            print("  Week standing: skipped (pass --week to fetch última jornada)")
        else:
            print(f"  Week {week} standing:")
            _print_standing(
                entry.get("week_standing"),
                highlight_team_id=summary.get("team_id"),
            )
        print(f"  Teams ({_count(entry.get('teams'))}):")
        _print_teams(entry.get("teams"))
        print(f"  Activity page {entry.get('activity_page')}:")
        _print_activity(entry.get("activity"))
        if entry.get("my_team") is not None:
            print(
                f"  My squad/clauses: fetched "
                f"(team id={entry.get('my_team_id')}; use --json for full body)"
            )
        print()


def _manager_label(value: Any) -> str:
    """Return a printable manager name from a string or object."""
    if isinstance(value, dict):
        name = value.get("managerName") or value.get("name")
        return str(name) if name else ""
    if isinstance(value, str):
        return value
    return ""


def _print_standing(standing: Any, *, highlight_team_id: Any) -> None:
    """Print top standing rows."""
    rows = _standing_rows(standing)
    if not rows:
        print("    (empty)")
        return
    for index, row in enumerate(rows[:15], start=1):
        rank = row.get("position") or row.get("rank") or index
        raw_team = row.get("team")
        team: dict[str, Any] = raw_team if isinstance(raw_team, dict) else {}
        name = (
            row.get("name")
            or row.get("teamName")
            or team.get("name")
            or _manager_label(row.get("manager") or team.get("manager"))
            or "?"
        )
        points = row.get("points") or row.get("livePoints") or ""
        row_team_id = row.get("teamId") or row.get("team_id") or team.get("id") or row.get("id")
        marker = (
            " ← you"
            if (highlight_team_id is not None and str(row_team_id) == str(highlight_team_id))
            else ""
        )
        print(f"    {rank}. {name}  {points}{marker}")
    if len(rows) > 15:
        print(f"    … {len(rows) - 15} more")


def _print_teams(teams: Any) -> None:
    """Print a short teams/managers list."""
    rows: list[Any]
    if isinstance(teams, list):
        rows = teams
    elif isinstance(teams, dict) and isinstance(teams.get("teams"), list):
        rows = teams["teams"]
    else:
        rows = []
    if not rows:
        print("    (empty)")
        return
    for row in rows[:20]:
        if not isinstance(row, dict):
            continue
        team_id = row.get("id") or row.get("teamId")
        name = row.get("name") or row.get("teamName") or "?"
        manager = _manager_label(row.get("manager")) or _manager_label(row.get("managerName"))
        suffix = f" — {manager}" if manager else ""
        print(f"    - {name} (id={team_id}){suffix}")
    if len(rows) > 20:
        print(f"    … {len(rows) - 20} more")


def _print_activity(activity: Any) -> None:
    """Print a short activity preview."""
    rows: list[Any]
    if isinstance(activity, list):
        rows = activity
    elif isinstance(activity, dict):
        for key in ("activity", "items", "data", "results"):
            nested = activity.get(key)
            if isinstance(nested, list):
                rows = nested
                break
        else:
            rows = []
    else:
        rows = []
    if not rows:
        print("    (empty)")
        return
    for row in rows[:10]:
        if isinstance(row, dict):
            text = (
                row.get("msg")
                or row.get("message")
                or row.get("description")
                or row.get("type")
                or json.dumps(row, ensure_ascii=False)[:120]
            )
            print(f"    - {text}")
        else:
            print(f"    - {row}")
    if len(rows) > 10:
        print(f"    … {len(rows) - 10} more")


def _count(payload: Any) -> int:
    """Count list-like payloads."""
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, dict) and isinstance(payload.get("teams"), list):
        return len(payload["teams"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
