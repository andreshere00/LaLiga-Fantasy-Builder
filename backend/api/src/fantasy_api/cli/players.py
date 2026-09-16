"""CLI to fetch LaLiga Fantasy player catalog, market value, and league cards."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from typing import Any

import httpx

_POSITION_LABELS: dict[str, str] = {
    "1": "GK",
    "2": "DEF",
    "3": "MID",
    "4": "FWD",
    "5": "COACH",
}


def main(argv: list[str] | None = None) -> int:
    """Print player catalog, market-value history, and optional league card.

    Public catalog and market-value calls do not need credentials. The
    league-scoped card requires ``--jwt`` / ``INTERNAL_JWT`` or session cookies.

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
            "LaLiga Fantasy Builder — list players, market-value history, "
            "and a league-scoped player card via the local API"
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
        help="Internal JWT (required only for --league-id)",
    )
    parser.add_argument(
        "--origin",
        default=os.environ.get("FANTASY_ORIGIN", "http://localhost:3000"),
        help="Origin header for auth CSRF checks",
    )
    parser.add_argument(
        "--player-id",
        default=None,
        help="Master player id (catalog row + market-value history)",
    )
    parser.add_argument(
        "--league-id",
        default=None,
        help="League id for the authenticated player card",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=15,
        help="Max catalog rows in text mode (default: 15)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print raw aggregated JSON instead of a text summary",
    )
    args = parser.parse_args(argv)

    jwt: str | None = None
    if args.league_id:
        jwt = _resolve_jwt(
            jwt=_normalize(args.jwt),
            session=_normalize(args.session),
            csrf=_normalize(args.csrf),
            auth_base=args.auth_base,
            origin=args.origin,
        )
        if jwt is None:
            return 1
        if not args.player_id:
            print("--league-id requires --player-id", file=sys.stderr)
            return 1

    try:
        report = _build_report(
            api_base=args.api_base,
            jwt=jwt,
            player_id=args.player_id,
            league_id=args.league_id,
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
        _print_report(report, limit=max(args.limit, 0))
    return 0


def _normalize(value: str | None) -> str:
    """Strip whitespace and accidental line breaks."""
    if not value:
        return ""
    return value.replace("\r", "").replace("\n", "").strip()


def _resolve_jwt(
    *,
    jwt: str,
    session: str,
    csrf: str,
    auth_base: str,
    origin: str,
) -> str | None:
    """Return an internal JWT, exchanging session cookies when needed."""
    if jwt:
        return jwt
    if not session or not csrf:
        print(
            "League card requires credentials. Provide --jwt / INTERNAL_JWT, or:\n"
            "  export FANTASY_SESSION='…'\n"
            "  export FANTASY_CSRF='…'\n"
            "Then re-run: uv run fantasy-players --player-id ID --league-id ID",
            file=sys.stderr,
        )
        return None
    return _exchange_token(
        auth_base=auth_base,
        session=session,
        csrf=csrf,
        origin=origin,
    )


def _exchange_token(
    *,
    auth_base: str,
    session: str,
    csrf: str,
    origin: str,
) -> str | None:
    """POST /auth/token and return the internal JWT."""
    url = f"{auth_base.rstrip('/')}/auth/token"
    headers = {"Origin": origin, "X-CSRF-Token": csrf}
    with httpx.Client(
        timeout=30.0,
        cookies={"fantasy_session": session, "fantasy_csrf": csrf},
    ) as client:
        response = client.post(url, headers=headers)
    if response.status_code == 401:
        print(
            "Unauthorized — session expired or CSRF mismatch. "
            "Re-login at /auth/login and copy fresh cookies.",
            file=sys.stderr,
        )
        return None
    if not response.is_success:
        print(
            f"Token exchange failed: {response.status_code} {response.text}",
            file=sys.stderr,
        )
        return None
    token = response.json().get("access_token")
    if not token:
        print("Token exchange response missing access_token", file=sys.stderr)
        return None
    return str(token)


def _api_get(api_base: str, path: str, jwt: str | None = None) -> Any:
    """GET a Fantasy Builder API path, optionally with an internal JWT."""
    url = f"{api_base.rstrip('/')}{path}"
    headers = {"Accept": "application/json"}
    if jwt:
        headers["Authorization"] = f"Bearer {jwt}"
    with httpx.Client(timeout=60.0) as client:
        response = client.get(url, headers=headers)
    if response.status_code == 401:
        body = _safe_json(response)
        error = body.get("error") or "unauthorized"
        detail = body.get("detail") or response.text
        raise RuntimeError(f"API {path} → {error}: {detail}")
    if not response.is_success:
        raise RuntimeError(
            f"API {path} failed: {response.status_code} {response.text[:300]}",
        )
    return response.json()


def _build_report(
    *,
    api_base: str,
    jwt: str | None,
    player_id: str | None,
    league_id: str | None,
) -> dict[str, Any]:
    """Fetch catalog, optional market-value, and optional league card."""
    catalog = _as_object_list(_api_get(api_base, "/players"))
    report: dict[str, Any] = {
        "player_count": len(catalog),
        "status_counts": _status_counts(catalog),
        "players": catalog,
    }
    if not player_id:
        return report

    player = _find_player(catalog, player_id)
    report["player_id"] = player_id
    report["player"] = player
    report["market_value"] = _api_get(
        api_base,
        f"/player/{player_id}/market-value",
    )
    if league_id:
        report["league_id"] = league_id
        report["league_card"] = _api_get(
            api_base,
            f"/player/{player_id}/league/{league_id}",
            jwt,
        )
    return report


def _as_object_list(payload: Any) -> list[dict[str, Any]]:
    """Normalize a JSON payload to a list of objects."""
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        nested = payload.get("players") or payload.get("data")
        if isinstance(nested, list):
            return [item for item in nested if isinstance(item, dict)]
        return [payload]
    return []


def _status_counts(players: list[dict[str, Any]]) -> dict[str, int]:
    """Count catalog rows by ``playerStatus``."""
    counts = Counter(str(item.get("playerStatus") or "unknown") for item in players)
    return dict(counts)


def _find_player(players: list[dict[str, Any]], player_id: str) -> dict[str, Any] | None:
    """Return the catalog row matching ``player_id``, if present."""
    for item in players:
        if str(item.get("id")) == str(player_id):
            return item
    return None


def _print_report(report: dict[str, Any], *, limit: int) -> None:
    """Print a human-readable players report."""
    players = report.get("players") or []
    print(f"Catalog: {report.get('player_count', len(players))} players")
    status_counts = report.get("status_counts") or {}
    if status_counts:
        parts = [f"{name}={count}" for name, count in sorted(status_counts.items())]
        print(f"  Status: {', '.join(parts)}")

    player_id = report.get("player_id")
    if player_id is None:
        print("  Top market value:")
        _print_catalog_rows(_top_by_market_value(players), limit=limit)
        return

    player = report.get("player")
    if player is None:
        print(f"  Player {player_id}: not in catalog")
    else:
        _print_player_detail(player)
    history = report.get("market_value")
    _print_market_value(history)
    if "league_card" in report:
        print(f"  League {report.get('league_id')} card:")
        _print_league_card(report.get("league_card"))


def _top_by_market_value(players: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sort catalog rows by market value descending."""
    return sorted(players, key=_market_value_number, reverse=True)


def _market_value_number(player: dict[str, Any]) -> int:
    """Parse a catalog market-value field to an int."""
    raw = player.get("marketValue")
    if isinstance(raw, bool):
        return 0
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str) and raw.isdigit():
        return int(raw)
    return 0


def _print_catalog_rows(players: list[dict[str, Any]], *, limit: int) -> None:
    """Print compact catalog rows."""
    if not players:
        print("    (empty)")
        return
    rows = players if limit <= 0 else players[:limit]
    for player in rows:
        player_id = player.get("id")
        name = player.get("nickname") or "?"
        position = _position_label(player.get("positionId"))
        value = _format_money(player.get("marketValue"))
        points = player.get("points")
        status = player.get("playerStatus") or ""
        print(
            f"    - {name} (id={player_id}) {position}  " f"value={value}  pts={points}  {status}"
        )
    extra = len(players) - len(rows)
    if extra > 0:
        print(f"    … {extra} more")


def _print_player_detail(player: dict[str, Any]) -> None:
    """Print one catalog player."""
    name = player.get("nickname") or "?"
    print(
        f"  Player {player.get('id')} {name}  "
        f"{_position_label(player.get('positionId'))}  teamId={player.get('teamId')}"
    )
    print(
        f"    status={player.get('playerStatus')}  "
        f"points={player.get('points')}  avg={player.get('averagePoints')}  "
        f"value={_format_money(player.get('marketValue'))}"
    )
    week_points = player.get("weekPoints")
    if isinstance(week_points, list) and week_points:
        parts: list[str] = []
        for item in week_points:
            if not isinstance(item, dict):
                continue
            week = item.get("weekNumber")
            points = item.get("points")
            parts.append(f"J{week}={points}")
        if parts:
            print(f"    week points: {', '.join(parts)}")


def _print_market_value(history: Any) -> None:
    """Print a short market-value history summary."""
    rows = _as_object_list(history)
    if not rows:
        print("    market-value: (empty)")
        return
    first = rows[0]
    last = rows[-1]
    print(
        f"    market-value: {len(rows)} points; "
        f"first {_format_money(first.get('marketValue'))} ({first.get('date')}); "
        f"last {_format_money(last.get('marketValue'))} ({last.get('date')})"
    )


def _print_league_card(card: Any) -> None:
    """Print a compact league-scoped player card."""
    if not isinstance(card, dict):
        print(f"    {card}")
        return
    master = card.get("playerMaster") if isinstance(card.get("playerMaster"), dict) else {}
    name = (master or {}).get("nickname") or card.get("nickname") or card.get("name") or "?"
    player_team_id = card.get("playerTeamId") or card.get("id")
    clause = card.get("buyoutClause")
    print(
        f"    {name}  playerTeamId={player_team_id}  "
        f"buyout={_format_money(clause) if clause is not None else '—'}"
    )


def _position_label(position_id: Any) -> str:
    """Map Fantasy ``positionId`` to a short label."""
    key = str(position_id) if position_id is not None else ""
    label = _POSITION_LABELS.get(key)
    if label:
        return f"{label}({key})"
    return key or "?"


def _format_money(value: Any) -> str:
    """Format a market-value or clause amount."""
    if value is None:
        return "—"
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, int):
        return f"{value:,}"
    if isinstance(value, str) and value.lstrip("-").isdigit():
        return f"{int(value):,}"
    return str(value)


def _safe_json(response: httpx.Response) -> dict[str, Any]:
    """Parse JSON object or return empty dict."""
    try:
        data = response.json()
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


if __name__ == "__main__":
    raise SystemExit(main())
