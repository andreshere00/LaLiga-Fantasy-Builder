# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from fantasy_api.schemas.player_stats import StatKey, StatSource
from fantasy_api.schemas.scraped import ScrapedStat
from fantasy_api.services.stat_merge import merge_fixture_stats

# ---- Happy path ---- #


def test_merge_fixture_stats_computed_official_fills_when_total_matches() -> None:
    scrape = {
        StatKey.MINUTES_PLAYED: ScrapedStat(count=90, points=None),
        StatKey.GOALS: ScrapedStat(count=1, points=None),
        StatKey.GOALS_CONCEDED: ScrapedStat(count=0, points=None),
    }
    stats, warnings = merge_fixture_stats(
        [(StatSource.FUTBOLFANTASY, scrape)],
        fantasy_points_total=7,
        position_id=4,
        minutes_played=90,
    )
    assert stats.minutes_played.fantasy_points == 2
    assert stats.goals.fantasy_points == 4
    assert stats.goals_conceded.fantasy_points == 1
    assert stats.goals.source == StatSource.COMPUTED_OFFICIAL
    assert not any(item.code == "computed_points_mismatch" for item in warnings)


def test_merge_fixture_stats_computed_official_keeps_points_on_total_mismatch() -> None:
    scrape = {
        StatKey.MINUTES_PLAYED: ScrapedStat(count=90, points=None),
        StatKey.GOALS: ScrapedStat(count=1, points=None),
        StatKey.GOALS_CONCEDED: ScrapedStat(count=0, points=None),
    }
    stats, warnings = merge_fixture_stats(
        [(StatSource.FUTBOLFANTASY, scrape)],
        fantasy_points_total=99,
        position_id=4,
        minutes_played=90,
    )
    assert stats.goals.fantasy_points == 4
    assert stats.goals.source == StatSource.COMPUTED_OFFICIAL
    assert any(item.code == "computed_points_mismatch" for item in warnings)


def test_merge_fixture_stats_catalog_points_skip_computed() -> None:
    catalog = {StatKey.GOALS: ScrapedStat(count=1, points=10)}
    scrape = {StatKey.GOALS: ScrapedStat(count=1, points=None)}
    stats, warnings = merge_fixture_stats(
        [
            (StatSource.FANTASY_CATALOG, catalog),
            (StatSource.FUTBOLFANTASY, scrape),
        ],
        fantasy_points_total=10,
        position_id=4,
    )
    assert stats.goals.fantasy_points == 10
    assert stats.goals.source == StatSource.FANTASY_CATALOG
    assert not any(item.code == "computed_points_mismatch" for item in warnings)


# ---- Edge cases ---- #


def test_merge_fixture_stats_published_points_plus_dazn_match_total() -> None:
    scrape = {
        StatKey.MINUTES_PLAYED: ScrapedStat(count=69, points=2),
        StatKey.GOALS: ScrapedStat(count=3, points=12),
        StatKey.PENALTIES_WON: ScrapedStat(count=1, points=2),
        StatKey.GOALS_CONCEDED: ScrapedStat(count=2, points=-1),
        StatKey.SHOTS: ScrapedStat(count=4, points=2),
        StatKey.DAZN_POINTS: ScrapedStat(count=None, points=4),
        StatKey.BIG_CHANCES_CREATED: ScrapedStat(count=1, points=None),
    }
    stats, warnings = merge_fixture_stats(
        [(StatSource.FUTBOLFANTASY, scrape)],
        fantasy_points_total=21,
        position_id=4,
        minutes_played=69,
    )
    assert stats.goals.fantasy_points == 12
    assert stats.penalties_won.fantasy_points == 2
    assert stats.big_chances_created.fantasy_points is None
    assert stats.dazn_points.dazn_points == 4
    assert not warnings


def test_official_points_forward_goal_and_ball_loss() -> None:
    from fantasy_api.services.fantasy_official_scoring import official_points_for_key

    assert official_points_for_key(StatKey.GOALS, 2, position_id=4, minutes=85) == 8
    assert official_points_for_key(StatKey.BALLS_LOST, 13, position_id=4, minutes=85) == -1
    assert official_points_for_key(StatKey.PENALTIES_WON, 1, position_id=4, minutes=69) == 2
