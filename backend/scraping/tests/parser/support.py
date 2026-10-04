"""Fixture builders shared by parser tests."""

from datetime import UTC, datetime
from pathlib import Path

from fantasy_scraping.models.page import PageKind, ScrapedPage, Source

FIXTURES = Path(__file__).parent / "fixtures" / "futbolfantasy"
FETCHED_AT = datetime(2026, 10, 4, 12, 0, tzinfo=UTC)


def page(
    name: str,
    *,
    slug: str = "raphinha",
    season: str = "2026-27",
    season_slug: str = "laliga-26-27",
    kind: PageKind = PageKind.PLAYER,
    status_code: int = 200,
    html: str | None = None,
    url: str | None = None,
) -> ScrapedPage:
    """Build a scraped page from a fixture file or an HTML string."""
    body = html if html is not None else (FIXTURES / name).read_text(encoding="utf-8")
    return ScrapedPage(
        source=Source.FUTBOLFANTASY,
        kind=kind,
        url=url or f"https://www.futbolfantasy.com/jugadores/{slug}/{season_slug}",
        fetched_at=FETCHED_AT,
        status_code=status_code,
        html=body,
        season=season,
        player_slug=slug,
        season_slug=season_slug,
    )
