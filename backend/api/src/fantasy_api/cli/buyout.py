"""CLI to fetch LaLiga Fantasy buyout shield status via the local API."""

from __future__ import annotations

import argparse
import json
import sys

import httpx

from fantasy_api.cli.common import add_common_cli_args, api_get, path_segment, resolve_jwt


def main(argv: list[str] | None = None) -> int:
    """Exchange session cookies for a JWT and print shield status (read-only).

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
            "LaLiga Fantasy Builder — squad-entry shield status via the local "
            "API (read-only; no pay, increase, or activate)"
        ),
    )
    add_common_cli_args(parser)
    parser.add_argument(
        "--league-id",
        required=True,
        help="League id",
    )
    parser.add_argument(
        "--player-team-id",
        required=True,
        help="Squad-entry id (playerTeamId)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print raw JSON instead of a text summary",
    )
    args = parser.parse_args(argv)

    jwt = resolve_jwt(args, command="fantasy-buyout")
    if jwt is None:
        return 1

    try:
        lid_path = path_segment(args.league_id)
        pt_path = path_segment(args.player_team_id)
        shield = api_get(
            args.api_base,
            f"/buyout/leagues/{lid_path}/player-teams/{pt_path}/shield",
            jwt=jwt,
        )
    except httpx.HTTPError as exc:
        print(f"HTTP error: {exc}", file=sys.stderr)
        return 1

    report = {
        "league_id": args.league_id,
        "player_team_id": args.player_team_id,
        "shield": shield,
    }
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(shield, ensure_ascii=False, indent=2))
    return 0
