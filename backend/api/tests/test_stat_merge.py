# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from fantasy_api.schemas.player_stats import StatKey, StatSource
from fantasy_api.schemas.scraped import ScrapedStat
from fantasy_api.services.stat_merge import merge_fixture_stats

# ---- Happy path ---- #


def test_merge_fixture_stats_combines_catalog_points_with_scraped_count() -> None:
    catalog = {
        StatKey.GOALS: ScrapedStat(count=3, points=30),
    }
    scrape = {
        StatKey.GOALS: ScrapedStat(count=3, points=None),
    }
    stats, warnings = merge_fixture_stats(
        [
            (StatSource.FANTASY_CATALOG, catalog),
            (StatSource.FUTBOLFANTASY, scrape),
        ]
    )
    assert stats.goals.count == 3
    assert stats.goals.fantasy_points == 30
    assert not warnings


def test_merge_fixture_stats_first_layer_wins() -> None:
    fantasy = {
        StatKey.GOALS: ScrapedStat(count=1, points=10),
    }
    scrape = {
        StatKey.GOALS: ScrapedStat(count=2, points=8),
    }
    stats, warnings = merge_fixture_stats(
        [
            (StatSource.FANTASY_CATALOG, fantasy),
            (StatSource.FUTBOLFANTASY, scrape),
        ]
    )
    assert stats.goals.count == 1
    assert stats.goals.fantasy_points == 10
    assert any(item.code == "source_conflict" for item in warnings)
