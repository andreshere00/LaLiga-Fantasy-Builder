"""Parse every committed FutbolFantasy HTML fixture."""

import pytest
from fantasy_scraping.models.page import PageKind
from fantasy_scraping.parser.service import ParserService
from support import page

# ---- Mocks, fixtures & helpers ---- #

SERVICE = ParserService()

_PAGES = (
    ("raphinha_laliga_26_27.html", PageKind.PLAYER, "laliga-26-27", "2026-27"),
    (
        "raphinha_champions_26_27.html",
        PageKind.COMPETITION,
        "champions-26-27",
        "2026-27",
    ),
    (
        "raphinha_copa_25_26.html",
        PageKind.COMPETITION,
        "copa-del-rey-25-26",
        "2025-26",
    ),
    (
        "goalkeeper_champions.html",
        PageKind.COMPETITION,
        "champions-26-27",
        "2026-27",
    ),
)


# ---- Happy path ---- #


@pytest.mark.parametrize(("name", "kind", "season_slug", "season"), _PAGES)
def test_parse_fixture_produces_markdown_and_report(
    name: str,
    kind: PageKind,
    season_slug: str,
    season: str,
) -> None:
    scraped = page(
        name,
        kind=kind,
        season_slug=season_slug,
        season=season,
        slug="raphinha" if "raphinha" in name else "ter-stegen",
    )
    player = SERVICE.parse_futbolfantasy(scraped)
    assert player.profile.identity.display_name
    assert SERVICE.to_markdown(player)
    assert SERVICE.to_player_report(player)
