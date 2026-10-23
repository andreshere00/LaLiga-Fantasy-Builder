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


def test_calendar_lazy_badges_preserve_real_images_and_correct_sides() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27_live.html"))
    recent = next(row for row in player.matches.recent if row.opponent == "Sevilla")
    assert recent.player_side == "away"
    assert (
        recent.home_badge
        == "https://static.futbolfantasy.com/uploads/images/equipos/escudom/17.png"
    )
    assert recent.away_badge == player.profile.identity.club_badge
    assert recent.competition_badge is not None
    assert recent.competition_badge.endswith("/laliga.png")
    assert recent.home_badge != recent.away_badge
    champions = next(
        row for row in player.matches.recent if row.competition.value == "champions_league"
    )
    assert champions.competition_badge is not None
    assert champions.competition_badge.endswith("/champions.png")


def test_calendar_unsafe_lazy_badge_uses_safe_real_src() -> None:
    from support import FIXTURES

    html = (FIXTURES / "raphinha_laliga_26_27_live.html").read_text()
    html = html.replace(
        'data-src="//static.futbolfantasy.com/uploads/images/equipos/escudom/17.png"',
        'data-src="javascript:alert(1)"',
    )
    player = SERVICE.parse_futbolfantasy(page("unused", html=html))
    recent = next(row for row in player.matches.recent if row.opponent == "Sevilla")
    assert recent.opponent_badge is None
    assert recent.home_badge is None
