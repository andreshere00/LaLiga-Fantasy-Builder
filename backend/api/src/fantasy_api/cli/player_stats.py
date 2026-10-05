"""CLI for player stats segments."""

from __future__ import annotations

import argparse
import json
import re
import sys

from fantasy_api.cli.common import add_common_cli_args, api_get, path_segment, resolve_jwt

_PLAYER_ID = re.compile(r"^[0-9]{1,10}$")


def main(argv: list[str] | None = None) -> int:
    """Entry point for ``fantasy-player-stats``."""
    parser = argparse.ArgumentParser(description="Read player stats segments from the API")
    add_common_cli_args(parser)
    parser.add_argument("--player-id", required=True)
    parser.add_argument(
        "--segment",
        choices=[
            "index",
            "fixtures",
            "market",
            "recent",
            "upcoming",
            "profile",
            "detail",
            "all",
        ],
        default="all",
    )
    parser.add_argument("--preset")
    parser.add_argument("--from")
    parser.add_argument("--to")
    parser.add_argument("--competition", action="append")
    parser.add_argument("--last", type=int)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--no-weather", action="store_true")
    parser.add_argument("--no-stats", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    if not _PLAYER_ID.match(args.player_id):
        print("invalid --player-id", file=sys.stderr)
        return 2

    jwt = resolve_jwt(args, command="fantasy-player-stats")
    if jwt is None:
        return 1

    player = path_segment(args.player_id)
    if args.segment == "detail":
        path, params = _detail_route(player, args)
        try:
            data = api_get(args.api_base, path, jwt, params=params)
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        if args.json:
            print(json.dumps(data, ensure_ascii=False, indent=2))
        else:
            print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0

    segments = _segments_for(args.segment)
    payload: dict[str, object] = {}
    errors: dict[str, str] = {}
    for name in segments:
        path, params = _route(name, player, args)
        try:
            payload[name] = api_get(args.api_base, path, jwt, params=params)
        except RuntimeError as exc:
            errors[name] = str(exc)
    if args.json:
        print(json.dumps({"data": payload, "errors": errors}, ensure_ascii=False, indent=2))
    else:
        for name, data in payload.items():
            print(f"=== {name} ===")
            print(json.dumps(data, ensure_ascii=False, indent=2))
    return 1 if errors else 0


def _segments_for(segment: str) -> list[str]:
    if segment == "all":
        return ["index", "fixtures", "market", "recent", "upcoming", "profile"]
    return [segment]


def _route(
    segment: str,
    player: str,
    args: argparse.Namespace,
) -> tuple[str, dict[str, str | int | bool] | None]:
    base = f"/players/{player}/stats"
    if segment == "index":
        return base, None
    if segment == "fixtures":
        params: dict[str, str | int | bool] = {}
        if args.last is not None:
            params["last"] = args.last
        if args.competition:
            params["competition"] = args.competition
        return f"{base}/fixtures", params or None
    if segment == "market":
        params = {}
        if args.preset:
            params["preset"] = args.preset
        if getattr(args, "from"):
            params["from"] = getattr(args, "from")
        if args.to:
            params["to"] = args.to
        return f"{base}/market", params or None
    if segment == "recent":
        params = {}
        if args.limit is not None:
            params["limit"] = args.limit
        if args.no_stats:
            params["include_stats"] = False
        return f"{base}/matches/recent", params or None
    if segment == "upcoming":
        params = {}
        if args.limit is not None:
            params["limit"] = args.limit
        if args.no_weather:
            params["include_weather"] = False
        return f"{base}/matches/upcoming", params or None
    return f"{base}/profile", None


def _detail_route(
    player: str,
    args: argparse.Namespace,
) -> tuple[str, dict[str, str | int | bool | list[str]] | None]:
    params: dict[str, str | int | bool | list[str]] = {}
    if args.last is not None:
        params["last"] = args.last
    if args.competition:
        params["competition"] = args.competition
    if args.preset:
        params["preset"] = args.preset
    if getattr(args, "from"):
        params["from"] = getattr(args, "from")
    if args.to:
        params["to"] = args.to
    if args.limit is not None:
        params["limit"] = args.limit
    if args.no_stats:
        params["include_stats"] = False
    if args.no_weather:
        params["include_weather"] = False
    return f"/players/{player}/stats/detail", params or None


if __name__ == "__main__":
    raise SystemExit(main())
