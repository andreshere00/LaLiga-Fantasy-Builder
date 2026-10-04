"""Offline CLI. Reads a file and writes JSON or Markdown. It does not use the network."""

import argparse
import sys
from datetime import datetime

from fantasy_scraping.models.page import PageKind, ScrapedPage, Source
from fantasy_scraping.parser.errors import ParserError
from fantasy_scraping.parser.hashing import canonical_json
from fantasy_scraping.parser.service import ParserService


def main(argv: list[str] | None = None) -> int:
    """Parse a saved HTML file.

    Args:
        argv: Arguments, excluding the program name. Defaults to ``sys.argv``.

    Returns:
        Process status. ``0`` on success, ``2`` on a parse error.
    """
    parser = argparse.ArgumentParser(prog="fantasy-parse")
    parser.add_argument("html_path")
    parser.add_argument("--url", required=True)
    parser.add_argument("--slug", required=True)
    parser.add_argument("--season", required=True)
    parser.add_argument("--season-slug", default="")
    parser.add_argument("--fetched-at", required=True)
    parser.add_argument("--kind", default="player")
    parser.add_argument("--json", dest="as_json", action="store_true")
    parser.add_argument("--markdown", dest="as_markdown", action="store_true")
    parser.add_argument("--output", default="-")
    args = parser.parse_args(argv)
    try:
        page = ScrapedPage(
            source=Source.FUTBOLFANTASY,
            kind=PageKind(args.kind),
            url=args.url,
            fetched_at=datetime.fromisoformat(args.fetched_at),
            status_code=200,
            html=_read(args.html_path),
            season=args.season,
            player_slug=args.slug,
            season_slug=args.season_slug,
        )
        service = ParserService()
        parsed = service.parse(page)
        chunks: list[str] = []
        if args.as_json or not args.as_markdown:
            chunks.append(canonical_json(parsed))
        if args.as_markdown:
            chunks.append(service.to_markdown(parsed.futbolfantasy))
        text = "\n".join(chunks)
        if not text.endswith("\n"):
            text += "\n"
        _write(args.output, text)
    except ParserError as exc:
        sys.stderr.write(f"{exc.code}: {exc.detail}\n")
        return 2
    except OSError:
        sys.stderr.write("input_invalid: invalid input\n")
        return 2
    return 0


def _read(path: str) -> str:
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def _write(path: str, text: str) -> None:
    if path == "-":
        sys.stdout.write(text)
        return
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


if __name__ == "__main__":
    raise SystemExit(main())
