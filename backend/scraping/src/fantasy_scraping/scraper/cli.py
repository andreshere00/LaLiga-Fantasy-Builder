"""Read-only ``fantasy-scraper`` CLI running the service in-process."""

import argparse
import asyncio
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from pydantic import ValidationError

from fantasy_scraping.models.page import PageKind
from fantasy_scraping.scraper.errors import InvalidRequestError, ScrapingError
from fantasy_scraping.scraper.models import ScrapeOptions
from fantasy_scraping.scraper.remote import RemoteError, RemoteScraper

INCLUDE_ALIASES: dict[str, PageKind] = {
    "club": PageKind.CLUB,
    "profile": PageKind.PLAYER,
    "market": PageKind.MARKET_WIDGET,
    "competitions": PageKind.COMPETITION,
}


def _parser() -> argparse.ArgumentParser:
    """Build the argument parser. No flag can disable robots or rate limits."""
    parser = argparse.ArgumentParser(prog="fantasy-scraper")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("resolve", "scrape", "probe"):
        cmd = sub.add_parser(name)
        cmd.add_argument("--service-url")
        cmd.add_argument("name")
        cmd.add_argument("--season")
        cmd.add_argument("--team")
        cmd.add_argument("--player-id")
        cmd.add_argument("--no-cache", action="store_true")
        cmd.add_argument("--json", action="store_true")
        if name == "probe":
            cmd.add_argument("--selector", action="append", default=[], metavar="NAME=CSS")
            cmd.add_argument("--first", action="store_true")
        if name == "scrape":
            cmd.add_argument("--include", default="profile")
            cmd.add_argument("--out", type=Path)
    return parser


def _write_pages(out: Path, pages: list[dict[str, object]]) -> None:
    """Write each page body to ``out`` and strip it from the printed metadata."""
    out.mkdir(parents=True, exist_ok=True)
    for page in pages:
        name = f"{page['player_slug']}-{page['kind']}-{page['season_slug'] or 'club'}.html"
        (out / name).write_text(str(page.pop("html")))


def _rules(args: argparse.Namespace) -> dict[str, str]:
    """Parse ``NAME=CSS`` pairs."""
    pairs = [item.partition("=") for item in args.selector]
    if not pairs or any(not sep or not key for key, sep, _ in pairs):
        raise InvalidRequestError("use --selector NAME=CSS")
    return {key: css for key, _, css in pairs}


async def _local(args: argparse.Namespace) -> dict[str, object]:
    """Run a command in-process."""
    from fantasy_scraping.config import get_settings
    from fantasy_scraping.main import build_service

    service, client = build_service()
    try:
        if args.command == "resolve":
            route = await service.resolve_player_route(
                args.name, args.team, season=args.season, player_id=args.player_id
            )
            return route.model_dump(mode="json")
        if args.command == "probe":
            if not get_settings().debug:
                raise InvalidRequestError("probe requires DEBUG=true")
            fragments = await service.probe(
                args.name, _rules(args), team=args.team, season=args.season, multiple=not args.first
            )
            return {"fragments": fragments}
        pages = await service.scrape_player(
            args.name,
            args.season,
            team=args.team,
            player_id=args.player_id,
            include=_include(args),
            options=ScrapeOptions(bypass_cache=args.no_cache),
        )
        return {"pages": [p.model_dump(mode="json") for p in pages]}
    finally:
        await client.aclose()


def _include(args: argparse.Namespace) -> frozenset[PageKind]:
    """Translate ``--include`` names."""
    return frozenset(INCLUDE_ALIASES[i] for i in args.include.split(","))


def _remote(args: argparse.Namespace) -> dict[str, object]:
    """Run a command against the HTTP surface."""
    remote = RemoteScraper(args.service_url)
    try:
        common = {"season": args.season, "team": args.team}
        if args.command == "resolve":
            params = {"name": args.name, "player_id": args.player_id, **common}
            return remote.call(
                "GET", "/internal/scrape/routes", params={k: v for k, v in params.items() if v}
            )
        if args.command == "probe":
            body = {
                "name": args.name,
                "extract_rules": _rules(args),
                "multiple": not args.first,
                **{k: v for k, v in common.items() if v},
            }
            return remote.call("POST", "/internal/scrape/probe", json=body)
        ref = {"name": args.name, "team": args.team, "player_id": args.player_id}
        body = {
            "players": [{k: v for k, v in ref.items() if v}],
            "season": args.season,
            "include": [k.value for k in _include(args)],
            "options": {"bypass_cache": args.no_cache},
        }
        result = remote.call("POST", "/internal/scrape/players", json=body)["results"][0]  # type: ignore[index]
        if result["error"]:
            raise RemoteError(result["error"]["error"], result["error"]["detail"])
        return {"pages": result["pages"]}
    finally:
        remote.close()


def main(argv: Sequence[str] | None = None) -> int:
    """Run the CLI.

    Args:
        argv: Arguments without the program name.

    Returns:
        Process exit code: 0 on success, 1 on a scraping error.
    """
    args = _parser().parse_args(argv)
    try:
        result = _remote(args) if args.service_url else asyncio.run(_local(args))
        if args.command == "scrape" and args.out:
            _write_pages(args.out, result["pages"])  # type: ignore[arg-type]
    except ValidationError:
        print(
            json.dumps(
                {
                    "error": "invalid_request",
                    "detail": (
                        "set SCRAPER_CONTACT or SCRAPER_USER_AGENT in backend/scraping/.env "
                        "(copy from .env.example)"
                    ),
                }
            ),
            file=sys.stderr,
        )
        return 1
    except (ScrapingError, RemoteError) as exc:
        print(json.dumps({"error": exc.category, "detail": exc.message}), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=None if args.json else 2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
