"""CLI to fetch LaLiga Fantasy player catalog and cards via the local API."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import httpx

from fantasy_api.cli.common import (
    add_common_cli_args,
    api_get,
    path_segment,
    resolve_jwt,
)


def main(argv: list[str] | None = None) -> int:
    """Print player catalog, market value, and optional league card.

    Environment (optional if flags are set):
        FANTASY_SESSION / FANTASY_CSRF — auth session cookies (league card only)
        INTERNAL_JWT — league card JWT (catalog and market value are public)
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
            "LaLiga Fantasy Builder — player catalog, market-value history, "
            "and optional league-contextual player card via the local API"
        ),
    )
    add_common_cli_args(parser)
    parser.add_argument(
        "--player-id",
        default=None,
        help="Master footballer id (also fetches market-value history)",
    )
    parser.add_argument(
        "--league-id",
        default=None,
        help="With --player-id, also fetch the league-contextual card (needs JWT)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print raw aggregated JSON instead of a text summary",
    )
    args = parser.parse_args(argv)

    jwt: str | None = None
    if args.league_id is not None and args.player_id is not None:
        jwt = resolve_jwt(args, command="fantasy-players")
        if jwt is None:
            return 1
    elif args.jwt:
        jwt = str(args.jwt)

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
        _print_report(report)
    return 0


def _build_report(
    *,
    api_base: str,
    jwt: str | None,
    player_id: str | None,
    league_id: str | None,
) -> dict[str, Any]:
    """Fetch catalog and optional player details."""
    catalog = api_get(api_base, "/players")
    report: dict[str, Any] = {"catalog": catalog}
    if player_id is not None:
        pid = path_segment(player_id)
        report["player_id"] = player_id
        report["market_value"] = api_get(api_base, f"/players/{pid}/market-value")
    if player_id is not None and league_id is not None:
        if not jwt:
            raise RuntimeError("League card requires --jwt or session credentials")
        lid = path_segment(league_id)
        report["league_id"] = league_id
        report["league_player"] = api_get(
            api_base, f"/players/{pid}/league/{lid}", jwt
        )
    return report


def _print_report(report: dict[str, Any]) -> None:
    """Print a human-readable players report."""
    catalog = report.get("catalog")
    players = catalog if isinstance(catalog, list) else []
    print(f"Players: {len(players)}")
    for item in players[:10]:
        if not isinstance(item, dict):
            continue
        nickname = item.get("nickname") or item.get("name") or item.get("id")
        print(f"  - {nickname} (id={item.get('id')})")
    if len(players) > 10:
        print(f"  …(+{len(players) - 10} more; use --json for full body)")
    market_value = report.get("market_value")
    if market_value is not None:
        entries = market_value if isinstance(market_value, list) else []
        print(f"Market-value entries: {len(entries)}")
        for entry in entries[-5:]:
            if isinstance(entry, dict):
                print(f"  {entry.get('date')}: {entry.get('marketValue')}")
    league_player = report.get("league_player")
    if league_player is not None:
        print(f"League card: {league_player}")


if __name__ == "__main__":
    raise SystemExit(main())
