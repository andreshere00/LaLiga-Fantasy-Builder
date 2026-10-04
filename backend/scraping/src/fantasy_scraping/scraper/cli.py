"""Read-only ``fantasy-scraper`` CLI running the service in-process."""

import argparse
import asyncio
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from fantasy_scraping.models.page import PageKind
from fantasy_scraping.scraper.errors import ScrapingError
from fantasy_scraping.scraper.models import ScrapeOptions

INCLUDE_ALIASES: dict[str, PageKind] = {
    "profile": PageKind.PLAYER,
    "market": PageKind.MARKET_WIDGET,
    "competitions": PageKind.COMPETITION,
}


def _parser() -> argparse.ArgumentParser:
    """Build the argument parser. No flag can disable robots or rate limits."""
    parser = argparse.ArgumentParser(prog="fantasy-scraper")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("resolve", "scrape"):
        cmd = sub.add_parser(name)
        cmd.add_argument("name")
        cmd.add_argument("--season")
        cmd.add_argument("--team")
        cmd.add_argument("--player-id")
        cmd.add_argument("--no-cache", action="store_true")
        cmd.add_argument("--json", action="store_true")
        if name == "scrape":
            cmd.add_argument("--include", default="profile")
            cmd.add_argument("--out", type=Path)
    return parser


async def _run(args: argparse.Namespace) -> dict[str, object]:
    """Execute one command and return a JSON-ready result."""
    from fantasy_scraping.main import build_service

    service, client = build_service()
    try:
        if args.command == "resolve":
            route = await service.resolve_player_route(
                args.name, args.team, season=args.season, player_id=args.player_id
            )
            return route.model_dump(mode="json")
        include = frozenset(INCLUDE_ALIASES[i] for i in args.include.split(","))
        pages = await service.scrape_player(
            args.name,
            args.season,
            team=args.team,
            player_id=args.player_id,
            include=include,
            options=ScrapeOptions(bypass_cache=args.no_cache),
        )
        if args.out:
            args.out.mkdir(parents=True, exist_ok=True)
            for page in pages:
                (args.out / f"{page.player_slug}-{page.kind}-{page.season_slug}.html").write_text(
                    page.html
                )
        return {"pages": [p.model_dump(mode="json", exclude={"html"}) for p in pages]}
    finally:
        await client.aclose()


def main(argv: Sequence[str] | None = None) -> int:
    """Run the CLI.

    Args:
        argv: Arguments without the program name.

    Returns:
        Process exit code: 0 on success, 1 on a scraping error.
    """
    args = _parser().parse_args(argv)
    try:
        result = asyncio.run(_run(args))
    except ScrapingError as exc:
        print(json.dumps({"error": exc.category, "detail": exc.message}), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=None if args.json else 2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
