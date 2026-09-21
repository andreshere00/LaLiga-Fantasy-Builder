"""CLI to fetch LaLiga Fantasy league market data via the local API."""

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
    path_segment,
    resolve_jwt,
)


def main(argv: list[str] | None = None) -> int:
    """Exchange session cookies for a JWT and print market summaries.

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
            "LaLiga Fantasy Builder — league market snapshot, history, and "
            "optional squad-entry offers via the local API (read-only)"
        ),
    )
    add_common_cli_args(parser)
    parser.add_argument(
        "--league-id",
        default=None,
        help="League id (default: resolve from GET /leagues)",
    )
    parser.add_argument(
        "--player-team-id",
        default=None,
        help="When set, also GET offers for this squad-entry id",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print raw aggregated JSON instead of a text summary",
    )
    args = parser.parse_args(argv)

    jwt = resolve_jwt(args, command="fantasy-market")
    if jwt is None:
        return 1

    try:
        report = _build_report(
            api_base=args.api_base,
            jwt=jwt,
            league_filter=args.league_id,
            player_team_id=args.player_team_id,
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
    player_team_id: str | None,
) -> dict[str, Any]:
    """Fetch market reads for one or more leagues."""
    leagues_payload = api_get(api_base, "/leagues", jwt=jwt)
    leagues = as_league_list(leagues_payload)
    if league_filter:
        leagues = [item for item in leagues if str(league_id(item)) == str(league_filter)]
        if not leagues:
            raise RuntimeError(f"League id {league_filter!r} not found in GET /leagues")

    reports: list[dict[str, Any]] = []
    for item in leagues:
        lid = league_id(item)
        if lid is None:
            continue
        lid_path = path_segment(lid)
        market = api_get(api_base, f"/market/leagues/{lid_path}", jwt=jwt)
        history = api_get(api_base, f"/market/leagues/{lid_path}/history", jwt=jwt)
        offers = None
        if player_team_id is not None:
            pt_path = path_segment(player_team_id)
            offers = api_get(
                api_base,
                f"/market/leagues/{lid_path}/player-teams/{pt_path}/offers",
                jwt=jwt,
            )
        reports.append(
            {
                "league_id": lid,
                "market": market,
                "history": history,
                "player_team_id": player_team_id,
                "offers": offers,
            }
        )
    return {"leagues": reports}


def _print_report(report: dict[str, Any]) -> None:
    """Print a short text summary."""
    for entry in report.get("leagues", []):
        lid = entry.get("league_id")
        print(f"League {lid}: market snapshot and history fetched.")
        if entry.get("offers") is not None:
            print(f"  Offers for player-team {entry.get('player_team_id')} included.")
