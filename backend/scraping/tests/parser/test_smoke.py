"""Smoke parse used while the golden files are produced."""

from fantasy_scraping.parser.service import ParserService
from support import page


def test_parse_raphinha_smoke() -> None:
    player = ParserService().parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    assert player.profile.identity.display_name == "Raphinha"
    assert player.season_stats is not None
    assert player.season_stats.participation is not None
    assert player.season_stats.participation.minutes == 550
    assert sum(row.week_points or 0 for row in player.fixtures) == 117
    assert [item.code for item in player.warnings]
