"""Browser-session analysis reports for leagues and teams API routes."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from urllib.parse import quote

GetJson = Callable[[str], Any]
PutJson = Callable[[str, Any], Any]


def fetch_leagues_analysis(
    *,
    get_json: GetJson,
    league_filter: str | None,
    week: int | None,
    activity_page: int,
    team_id: str | None = None,
) -> dict[str, Any]:
    """GET leagues, standing, week standing, activity, teams, and a squad.

    Args:
        get_json: Authenticated GET against the local Fantasy Builder API.
        league_filter: Optional league id to keep (default: all leagues).
        week: Matchweek for week standing (default: infer from payload).
        activity_page: Activity page index.
        team_id: Squad to fetch under the league (default: caller's team).

    Returns:
        Aggregated JSON for one or more leagues.

    Raises:
        RuntimeError: When the requested league is missing.
    """
    leagues = _as_league_list(get_json("/leagues"))
    if league_filter:
        leagues = [
            item for item in leagues if str(_league_id(item)) == str(league_filter)
        ]
        if not leagues:
            raise RuntimeError(f"League id {league_filter!r} not found in /leagues")

    reports: list[dict[str, Any]] = []
    for item in leagues:
        lid = _league_id(item)
        if lid is None:
            continue
        lid_path = _segment(lid)
        standing = get_json(f"/leagues/{lid_path}/standing")
        inferred_week = week if week is not None else infer_week(item, standing)
        week_standing = None
        if inferred_week is not None:
            week_standing = get_json(
                f"/leagues/{lid_path}/standing/{inferred_week}",
            )
        activity = get_json(f"/leagues/{lid_path}/activity/{activity_page}")
        teams = get_json(f"/leagues/{lid_path}/teams")
        squad_id = team_id if team_id is not None else _my_team_id(item)
        squad = None
        if squad_id is not None:
            squad = get_json(f"/leagues/{lid_path}/teams/{_segment(squad_id)}")
        reports.append(
            {
                "league_id": lid,
                "league": item,
                "standing": standing,
                "week": inferred_week,
                "week_standing": week_standing,
                "activity_page": activity_page,
                "activity": activity,
                "teams": teams,
                "team_id": squad_id,
                "team": squad,
            }
        )
    return {"leagues": reports}


def fetch_teams_analysis(
    *,
    get_json: GetJson,
    team_id: str | None,
    league_filter: str | None,
    week: int | None,
    put_json: PutJson | None = None,
    put_lineup_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """GET team money and lineup, optionally PUT a lineup replacement.

    Args:
        get_json: Authenticated GET against the local Fantasy Builder API.
        team_id: Fantasy team id (default: resolve from /leagues).
        league_filter: Optional league id when resolving the team.
        week: Matchweek for weekly lineup (default: infer from /leagues).
        put_json: Authenticated PUT used only when ``put_lineup_body`` is set.
        put_lineup_body: Full-replace lineup JSON (requires ``--team-id``).

    Returns:
        Aggregated JSON for one or more teams.

    Raises:
        RuntimeError: When team ids cannot be resolved or PUT is unsafe.
    """
    leagues = _as_league_list(get_json("/leagues"))
    inferred_week = week if week is not None else _infer_week_from_leagues(leagues)
    targets = _team_targets(
        leagues,
        team_id=team_id,
        league_filter=league_filter,
    )
    if put_lineup_body is not None:
        if team_id is None:
            raise RuntimeError("PUT /teams/{id}/lineup requires --team-id")
        if put_json is None:
            raise RuntimeError("PUT lineup is not configured")

    reports: list[dict[str, Any]] = []
    for target in targets:
        tid = _segment(target["team_id"])
        money = get_json(f"/teams/{tid}/money")
        lineup = get_json(f"/teams/{tid}/lineup")
        week_lineup = None
        if inferred_week is not None:
            week_lineup = get_json(f"/teams/{tid}/lineup/week/{inferred_week}")
        put_result = None
        if put_lineup_body is not None and put_json is not None:
            put_result = put_json(f"/teams/{tid}/lineup", put_lineup_body)
        reports.append(
            {
                "team_id": target["team_id"],
                "league_id": target.get("league_id"),
                "league_name": target.get("league_name"),
                "money": money,
                "lineup": lineup,
                "week": inferred_week,
                "week_lineup": week_lineup,
                "put_lineup": put_result,
            }
        )
    return {"teams": reports}


def infer_week(league: dict[str, Any], standing: Any) -> int | None:
    """Infer the current/last matchweek from league or standing payloads."""
    sources: list[Any] = [league]
    if isinstance(standing, dict):
        sources.append(standing)
    for source in sources:
        if not isinstance(source, dict):
            continue
        for key in (
            "week",
            "currentWeek",
            "current_week",
            "gameweek",
            "jornada",
            "lastWeek",
            "last_week",
        ):
            value = source.get(key)
            if isinstance(value, int) and value >= 1:
                return value
            if isinstance(value, str) and value.isdigit() and int(value) >= 1:
                return int(value)
    return None


def _infer_week_from_leagues(leagues: list[dict[str, Any]]) -> int | None:
    """Return the first inferable week from a leagues list."""
    for item in leagues:
        week = infer_week(item, None)
        if week is not None:
            return week
    return None


def _team_targets(
    leagues: list[dict[str, Any]],
    *,
    team_id: str | None,
    league_filter: str | None,
) -> list[dict[str, Any]]:
    """Resolve team targets from an explicit id or GET /leagues."""
    if team_id is not None:
        return [
            {
                "team_id": team_id,
                "league_id": league_filter,
                "league_name": None,
            }
        ]

    selected = leagues
    if league_filter:
        selected = [
            item for item in leagues if str(_league_id(item)) == str(league_filter)
        ]
        if not selected:
            raise RuntimeError(f"League id {league_filter!r} not found in /leagues")

    targets: list[dict[str, Any]] = []
    for item in selected:
        tid = _my_team_id(item)
        if tid is None:
            continue
        targets.append(
            {
                "team_id": tid,
                "league_id": _league_id(item),
                "league_name": item.get("name") or item.get("leagueName"),
            }
        )
    if not targets:
        raise RuntimeError(
            "No team id found. Pass --team-id, or ensure /leagues embeds team.id",
        )
    return targets


def _as_league_list(payload: Any) -> list[dict[str, Any]]:
    """Normalize /leagues payload to a list of objects."""
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        nested = payload.get("leagues")
        if isinstance(nested, list):
            return [item for item in nested if isinstance(item, dict)]
        return [payload]
    return []


def _league_id(item: dict[str, Any]) -> Any:
    """Extract league id from a leagues list item."""
    return item.get("id") or item.get("leagueId") or item.get("league_id")


def _my_team_id(item: dict[str, Any]) -> Any:
    """Extract the caller's team id from a leagues list item."""
    team = item.get("team")
    if isinstance(team, dict):
        return team.get("id") or team.get("teamId")
    return item.get("teamId") or item.get("team_id")


def _segment(value: str | int) -> str:
    """Percent-encode a path segment."""
    return quote(str(value), safe="")
