"""Fetch real-club standings from the authenticated local API."""

import argparse
import json
import sys

import httpx

from fantasy_api.cli.common import add_common_cli_args, api_get, path_segment, resolve_jwt


def _positive_id(value: str) -> int:
    """Parse a positive application competition id."""
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("competition id must be positive")
    return number


def _season(value: str) -> int:
    """Validate the season's starting year consistently with the API."""
    year = int(value)
    if not 2000 <= year <= 2100:
        raise argparse.ArgumentTypeError("season must be between 2000 and 2100")
    return year


def main(argv: list[str] | None = None) -> int:
    """Print a complete club classification through a read-only API method.

    Args:
        argv: Optional CLI arguments.

    Returns:
        Zero on success, one on authentication/provider failure.
    """
    parser = argparse.ArgumentParser(description="Real LALIGA club standings via the local API")
    add_common_cli_args(parser)
    parser.add_argument("--competition-id", type=_positive_id, default=1)
    parser.add_argument("--season", type=_season, default=None, help="Season starting year")
    parser.add_argument("--mode", choices=["live", "completed"], default="completed")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    jwt = resolve_jwt(args, command="fantasy-standings")
    if jwt is None:
        return 1
    params = {"mode": args.mode}
    if args.season is not None:
        params["season"] = args.season
    try:
        report = api_get(
            args.api_base,
            f"/competitions/{path_segment(args.competition_id)}/standings",
            jwt,
            params=params,
        )
    except (httpx.HTTPError, RuntimeError):
        print(
            "Could not fetch standings; check API/provider configuration and authentication.",
            file=sys.stderr,
        )
        return 1
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"LALIGA {report['season']}/{str(report['season'] + 1)[-2:]} ({report['mode']})")
        print("#   Club                     Pts  P  W  D  L  GF  GA  GD  Last 5")
        for row in report["rows"]:
            form = " ".join(match["result"] for match in row["last5Matches"])
            print(
                f"{row['position']:>2}  {row['team']['name']:<24} {row['points']:>3} "
                f"{row['played']:>2} {row['won']:>2} {row['drawn']:>2} {row['lost']:>2} "
                f"{row['goalsFor']:>3} {row['goalsAgainst']:>3} {row['goalDifference']:>3}  {form}"
            )
        print(f"Source: {report['source']}; fetched: {report['fetchedAt']}; live unavailable")
    return 0
