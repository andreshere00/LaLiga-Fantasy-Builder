"""Read-only favorites and scouting inbox CLI."""

import argparse
import json
import sys

import httpx

from fantasy_api.cli.common import add_common_cli_args, api_get, path_segment, resolve_jwt


def main(argv: list[str] | None = None) -> int:
    """Print application favorites and persistent alerts without changing read status."""
    parser = argparse.ArgumentParser(description="Read saved favorites and scouting alerts")
    add_common_cli_args(parser)
    parser.add_argument("--league-id")
    args = parser.parse_args(argv)
    jwt = resolve_jwt(args, command="fantasy-scouting")
    if jwt is None:
        return 1
    query = f"?league_id={path_segment(args.league_id)}" if args.league_id else ""
    try:
        report = {
            "favorites": api_get(args.api_base, f"/scouting/favorites{query}", jwt),
            "notifications": api_get(args.api_base, f"/scouting/notifications{query}", jwt),
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except (httpx.HTTPError, RuntimeError):
        print("Scouting request failed", file=sys.stderr)
        return 1
    return 0
