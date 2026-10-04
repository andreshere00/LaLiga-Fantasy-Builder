"""Player report Markdown renderer."""

from datetime import date

import pytest
from fantasy_scraping.parser.errors import RenderError
from fantasy_scraping.parser.markdown.report import (
    _fantasy_pair,
    _format_points,
    _line_points,
    _market_preset,
    _match_result,
    render_player_report,
)
from fantasy_scraping.parser.models.common import MinutesNote
from fantasy_scraping.parser.models.futbolfantasy import (
    CurrentInjury,
    FutbolFantasyPlayer,
    MarketPoint,
    MatchesBlock,
    RecentMatch,
)
from fantasy_scraping.parser.models.stats import unavailable
from fantasy_scraping.parser.models.supplement import (
    FantasySupplement,
    FantasyWeek,
    UpcomingContext,
)
from fantasy_scraping.parser.normalise.dates import season_bounds
from fantasy_scraping.parser.rules.loader import RuleRepository
from fantasy_scraping.parser.service import ParserService
from support import page

# ---- Mocks, fixtures & helpers ---- #

SERVICE = ParserService()
RULES = RuleRepository().load()


def _raphinha() -> FutbolFantasyPlayer:
    return SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))


# ---- Happy path ---- #


def test_to_player_report_accepts_parsed_player_wrapper() -> None:
    parsed = SERVICE.parse(page("raphinha_laliga_26_27.html"))
    assert SERVICE.to_player_report(parsed) == SERVICE.to_player_report(parsed.futbolfantasy)


def test_render_player_report_upcoming_weather_and_distance() -> None:
    player = _raphinha()
    first_up = player.matches.upcoming[0]
    supplement = FantasySupplement(
        upcoming=[
            UpcomingContext(
                date=first_up.date,
                weather="Soleado, 22 °C",
                distance_km=540,
            )
        ]
    )
    text = render_player_report(player, RULES, supplement)
    assert "Soleado" in text
    assert "540" in text


def test_render_player_report_injury_header_when_present() -> None:
    player = _raphinha().model_copy(
        update={
            "profile": _raphinha().profile.model_copy(
                update={
                    "injury": CurrentInjury(
                        diagnosis="Esguince",
                        since=date(2026, 9, 1),
                        ongoing=True,
                    )
                }
            )
        }
    )
    text = render_player_report(player, RULES, FantasySupplement())
    assert "**Lesión:** Esguince" in text
    assert "01/09/26" in text


def test_render_player_report_injury_without_since_uses_dash() -> None:
    player = _raphinha().model_copy(
        update={
            "profile": _raphinha().profile.model_copy(
                update={"injury": CurrentInjury(diagnosis="Molestia", since=None)}
            )
        }
    )
    text = render_player_report(player, RULES, FantasySupplement())
    assert "(desde —)" in text


# ---- Error paths ---- #


def test_to_player_report_missing_name_raises() -> None:
    player = _raphinha()
    nameless = player.model_copy(
        update={
            "profile": player.profile.model_copy(
                update={"identity": player.profile.identity.model_copy(update={"display_name": ""})}
            )
        }
    )
    with pytest.raises(RenderError):
        SERVICE.to_player_report(nameless)


# ---- Edge cases ---- #


def test_render_player_report_empty_match_lists() -> None:
    player = _raphinha().model_copy(update={"matches": MatchesBlock()})
    text = render_player_report(player, RULES, FantasySupplement())
    assert "*Sin partidos publicados.*" in text


def test_match_result_without_score_is_dash() -> None:
    row = RecentMatch(
        date=date(2026, 10, 1),
        minutes=MinutesNote(raw="90'", event="full", minutes=90),
    )
    assert _match_result(row) == "—"


def test_line_points_unavailable_stat_is_dash() -> None:
    assert _line_points(unavailable("layer_missing")) == "—"


def test_fantasy_pair_and_format_points_edges() -> None:
    assert _fantasy_pair(None) == ("—", "—")
    assert _fantasy_pair([3]) == ("3", "—")
    assert _format_points(10) == "10"
    assert _format_points(10.5) == "10,50"


def test_market_preset_empty_and_zero_relative() -> None:
    assert _market_preset([], date(2026, 10, 4), "laliga-26-27", kind="days", days=5) == (
        "—",
        "—",
        "—",
        "—",
    )
    zero = _market_preset(
        [MarketPoint(date=date(2026, 10, 4), value=0)],
        date(2026, 10, 4),
        "laliga-26-27",
        kind="days",
        days=0,
    )
    assert zero[3] == "—"
    season = _market_preset(
        [MarketPoint(date=date(2026, 7, 1), value=100)],
        date(2026, 10, 4),
        None,
        kind="season",
        days=None,
    )
    assert season[0] == "100"


def test_market_preset_window_outside_history() -> None:
    row = _market_preset(
        [MarketPoint(date=date(2027, 1, 1), value=50)],
        date(2026, 10, 4),
        "laliga-26-27",
        kind="days",
        days=5,
    )
    assert row == ("—", "—", "—", "—")


def test_season_bounds_without_slug_uses_anchor_year() -> None:
    start, end = season_bounds(None, date(2028, 3, 1))
    assert start == date(2028, 7, 1)
    assert end == date(2029, 6, 30)


def test_non_laliga_recent_ignores_fantasy_week_stats() -> None:
    player = _raphinha()
    supplement = FantasySupplement(
        weeks=[FantasyWeek(week_number=2, total_points=1, stats={"goals": [99, 99]})]
    )
    text = render_player_report(player, RULES, supplement)
    chunk = text.split("30/09", maxsplit=1)[1].split("#### Estadísticas", maxsplit=1)[1]
    chunk = chunk.split("####", maxsplit=1)[0]
    assert "| Goles | 99 | 99 |" not in chunk
