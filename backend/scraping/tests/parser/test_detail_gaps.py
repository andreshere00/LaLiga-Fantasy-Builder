# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from datetime import date

from support import page

from fantasy_scraping.parser.service import ParserService

# ---- Happy path ---- #

SERVICE = ParserService()


def test_link_recent_null_fixture_date_copies_stats_and_points() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    linked = next(row for row in player.matches.recent if row.week_points == 21)
    assert linked.stats is not None
    assert linked.stats_source == "futbolfantasy"
    assert linked.stats.goals.count == 1


def test_extract_news_noticias_box_skips_footer_list() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27_live.html"))
    titles = [item.title for item in player.profile.news]
    assert any("descartan lesión" in title for title in titles)
    assert not any("example.com" in item.url for item in player.profile.news)


def test_extract_news_date_dd_mm_uses_season_year() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27_live.html"))
    assert any(item.published_on == date(2026, 10, 2) for item in player.profile.news)


def test_extract_position_personal_block_returns_delantero() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27_live.html"))
    assert player.profile.position is not None
    assert player.profile.position.main == "Delantero"


def test_season_stats_yellow_cards_label_fills_discipline() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27_live.html"))
    assert player.season_stats is not None
    assert player.season_stats.discipline is not None
    assert player.season_stats.discipline.yellow_cards is not None
