"""Read real-club dossiers from the authenticated local API."""

import argparse
import json
import sys

import httpx

from fantasy_api.cli.common import add_common_cli_args, api_get, path_segment, resolve_jwt


def _club_id(value: str) -> int:
    """Parse a positive teams-master id."""
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("club id must be positive")
    return number


def main(argv: list[str] | None = None) -> int:
    """Print the club index or one dossier. This command does not write to Fantasy.

    Args:
        argv: Optional CLI arguments.

    Returns:
        Zero on success, one on authentication or provider failure.
    """
    parser = argparse.ArgumentParser(description="Read-only real-club dossiers")
    add_common_cli_args(parser)
    parser.add_argument("club_id", nargs="?", type=_club_id)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    jwt = resolve_jwt(args, command="fantasy-clubs")
    if jwt is None:
        return 1
    path = "/clubs" if args.club_id is None else f"/clubs/{path_segment(args.club_id)}"
    try:
        report = api_get(args.api_base, path, jwt)
    except (httpx.HTTPError, RuntimeError):
        print(
            "Could not fetch clubs; check API configuration and authentication.",
            file=sys.stderr,
        )
        return 1
    if args.json or args.club_id is not None:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    for club in report["clubs"]:
        slug = club.get("slug") or "unavailable"
        print(f"{club['clubId']:>4}  {club['name']:<24} {slug}")
    return 0
