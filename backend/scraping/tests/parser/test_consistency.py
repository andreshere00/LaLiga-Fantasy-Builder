"""Cross-section consistency warnings."""

from support import page

from fantasy_scraping.parser.consistency import apply_consistency
from fantasy_scraping.parser.service import ParserService

# ---- Mocks, fixtures & helpers ---- #

SERVICE = ParserService()


# ---- Happy path ---- #


def test_apply_consistency_adds_warnings_on_mismatch() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    broken = player.model_copy(
        update={
            "season_stats": (
                player.season_stats.model_copy(
                    update={
                        "participation": player.season_stats.participation.model_copy(
                            update={"minutes": 1}
                        )
                    }
                )
                if player.season_stats and player.season_stats.participation
                else player.season_stats
            )
        }
    )
    checked = apply_consistency(broken, "2026-27")
    codes = {item.code for item in checked.warnings}
    assert "minutes_sum_mismatch" in codes


def test_apply_consistency_fantasy_points_mismatch() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    points = player.fantasy_points
    assert points is not None
    broken = player.model_copy(
        update={
            "fantasy_points": points.model_copy(
                update={"total": points.total.model_copy(update={"net": 0.0})}
            )
        }
    )
    checked = apply_consistency(broken, "2026-27")
    assert "points_sum_mismatch" in {item.code for item in checked.warnings}


def test_apply_consistency_home_away_total_mismatch() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    points = player.fantasy_points
    assert points is not None
    broken = player.model_copy(
        update={
            "fantasy_points": points.model_copy(
                update={
                    "total_home": points.total_home.model_copy(update={"net": 0.0}),
                }
            )
        }
    )
    checked = apply_consistency(broken, "2026-27")
    assert "home_away_total_mismatch" in {item.code for item in checked.warnings}


def test_apply_consistency_average_mismatch() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    points = player.fantasy_points
    assert points is not None
    broken = player.model_copy(
        update={
            "fantasy_points": points.model_copy(
                update={"average": points.average.model_copy(update={"net": 0.01})}
            )
        }
    )
    checked = apply_consistency(broken, "2026-27")
    assert "average_mismatch" in {item.code for item in checked.warnings}


def test_apply_consistency_market_moves_mismatch() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    market = player.market
    assert market is not None and len(market.daily_moves) >= 2
    moves = list(market.daily_moves)
    moves[0] = moves[0].model_copy(update={"change": moves[0].change + 1})
    broken = player.model_copy(update={"market": market.model_copy(update={"daily_moves": moves})})
    checked = apply_consistency(broken, "2026-27")
    assert "market_moves_mismatch" in {item.code for item in checked.warnings}


def test_apply_consistency_injury_duration_and_map_mismatch() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    history = player.profile.injury_history
    assert history is not None and history.entries
    entry = history.entries[0].model_copy(update={"duration_days": 1})
    broken = player.model_copy(
        update={
            "profile": player.profile.model_copy(
                update={
                    "injury_history": history.model_copy(update={"entries": [entry]}),
                }
            )
        }
    )
    checked = apply_consistency(broken, "2026-27")
    assert "injury_duration_mismatch" in {item.code for item in checked.warnings}


def test_apply_consistency_recent_fixture_mismatch() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    recent = list(player.matches.recent)
    first = recent[0]
    score = first.score.model_copy(update={"home": 0})
    recent[0] = first.model_copy(update={"score": score})
    broken = player.model_copy(
        update={"matches": player.matches.model_copy(update={"recent": recent})}
    )
    checked = apply_consistency(broken, "2026-27")
    assert "recent_vs_fixtures_mismatch" in {item.code for item in checked.warnings}


def test_apply_consistency_average_last_three_mismatch() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    points = player.fantasy_points
    assert points is not None and len(player.fixtures) >= 3
    broken = player.model_copy(
        update={
            "fantasy_points": points.model_copy(
                update={"average_last_3": points.average_last_3.model_copy(update={"net": 0.01})}
            )
        }
    )
    checked = apply_consistency(broken, "2026-27")
    assert "average_mismatch" in {item.code for item in checked.warnings}


def test_apply_consistency_minutes_skips_unknown_rows() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    fixtures = list(player.fixtures)
    fixtures[0] = fixtures[0].model_copy(
        update={"minutes_out": fixtures[0].minutes_out.model_copy(update={"minutes": None})}
    )
    broken = player.model_copy(update={"fixtures": fixtures})
    checked = apply_consistency(broken, "2026-27")
    codes = {item.code for item in checked.warnings}
    assert "minutes_sum_mismatch" not in codes
    assert "minutes_assumed_unknown" in codes


def test_apply_consistency_season_window_mismatch() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    fixtures = list(player.fixtures)
    fixtures[0] = fixtures[0].model_copy(update={"date": fixtures[0].date.replace(year=2010)})
    broken = player.model_copy(update={"fixtures": fixtures})
    checked = apply_consistency(broken, "2026-27")
    assert "season_window_mismatch" in {item.code for item in checked.warnings}
