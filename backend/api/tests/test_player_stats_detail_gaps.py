# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.domain.venues import default_venue_directory
from fantasy_api.schemas.player_stats import Competition, FixtureRef
from fantasy_api.services.player_stats import (
    PlayerStatsService,
    _competition_label,
    _expected_return_date,
    _fill_fixture_teams,
    _fixture_opponent,
)
from fantasy_api.services.wire_map import parse_wire_document
from test_container import test_settings as api_test_settings

LIVE = Path(__file__).parent / "fixtures" / "scraping" / "futbolfantasy_raphinha_live.json"


def _service(clock: datetime | None = None) -> PlayerStatsService:
    moment = clock or datetime(2026, 10, 5, 12, 0, tzinfo=UTC)
    return PlayerStatsService(
        resolver=MagicMock(),
        players=MagicMock(),
        calendar=MagicMock(),
        scraped=MagicMock(),
        stats_repo=MagicMock(),
        venues=default_venue_directory(),
        clock=lambda: moment,
        settings=api_test_settings(),
    )


# ---- Happy path ---- #


def test_competition_label_laliga_is_league() -> None:
    assert _competition_label("LaLiga", Competition.LALIGA) == "LEAGUE"


def test_competition_label_champions_league_is_champions() -> None:
    assert _competition_label("Champions League", Competition.CHAMPIONS_LEAGUE) == "CHAMPIONS"


def test_upcoming_home_opponent_fills_barcelona_and_getafe() -> None:
    fixture = _fill_fixture_teams(
        FixtureRef(competition=Competition.LALIGA, is_home=True, opponent="Getafe"),
        short_club="Barcelona",
        opponent="Getafe",
    )
    assert fixture.home_team == "Barcelona"
    assert fixture.away_team == "Getafe"


def test_fixtures_away_code_sets_opponent_levante() -> None:
    venues = default_venue_directory()
    assert (
        _fixture_opponent(
            venues,
            is_home=False,
            home_team="LEV",
            away_team="BAR",
        )
        == "Levante"
    )


def test_travel_away_unknown_venue_sets_player_team_travels_true() -> None:
    service = _service()
    home = service._venues.for_club(fantasy_id=4, name=None)
    travel = service._travel(home, False, "Unknown FC")
    assert travel.player_team_travels is True
    assert travel.to_venue is None


def test_match_venue_away_does_not_use_player_ground() -> None:
    service = _service()
    home = service._venues.for_club(fantasy_id=4, name=None)
    venue = service._match_venue(home, False, "Unknown FC")
    assert venue is None


@pytest.mark.asyncio
async def test_weather_http_401_detail_has_status_and_no_key() -> None:
    service = _service()
    home = service._venues.for_club(fantasy_id=4, name=None)
    service._stats_repo.get_forecast = AsyncMock(
        side_effect=UpstreamError(
            "weather unavailable",
            status_code=503,
            provider_status=401,
        )
    )
    weather, warning = await service._weather_for_match(
        home, datetime(2026, 10, 10, 16, 30, tzinfo=UTC)
    )
    assert weather.reason == "provider_unavailable"
    assert warning is not None
    assert warning.detail == "401"
    assert "appid" not in (warning.detail or "")


def test_profile_disponible_jornada_sets_expected_return() -> None:
    wire = parse_wire_document(json.loads(LIVE.read_text(encoding="utf-8")))
    expected = _expected_return_date(wire, "Disponible para la jornada 8")
    assert expected == date(2026, 10, 10)


def test_merge_fixture_stats_unset_dazn_stays_null() -> None:
    from fantasy_api.schemas.player_stats import StatKey, StatSource
    from fantasy_api.schemas.scraped import ScrapedStat
    from fantasy_api.services.stat_merge import merge_fixture_stats

    stats, _ = merge_fixture_stats(
        [(StatSource.FUTBOLFANTASY, {StatKey.GOALS: ScrapedStat(count=3, points=None)})],
        fantasy_points_total=21,
    )
    assert stats.goals.dazn_points is None
    assert stats.goals.fantasy_points is None


def test_merge_fixture_stats_row_total_only_skips_mismatch() -> None:
    from fantasy_api.schemas.player_stats import StatKey, StatSource
    from fantasy_api.schemas.scraped import ScrapedStat
    from fantasy_api.services.stat_merge import merge_fixture_stats

    _, warnings = merge_fixture_stats(
        [(StatSource.FUTBOLFANTASY, {StatKey.GOALS: ScrapedStat(count=3, points=None)})],
        fantasy_points_total=21,
    )
    assert not any(item.code == "points_total_mismatch" for item in warnings)


def test_averages_from_season_divides_totals_by_matches() -> None:
    from fantasy_api.services.player_stats import averages_from_season

    rows = averages_from_season(
        {
            "matchesCounted": 7,
            "attack": {"goals": 12, "shotsOnTarget": {"numerator": 16, "denominator": 25}},
            "defense": {},
            "discipline": {},
        }
    )
    by_code = {row.code: row.value for row in rows}
    assert by_code["G"] == 1.71
    assert by_code["TaP"] == 2.29
    assert by_code["T"] == 3.57
    assert by_code["DE"] is None


def test_apply_recent_dates_copies_blank_fixture_date() -> None:
    from fantasy_api.schemas.player_stats import FixtureRef, FixtureStats, FixtureStatsRow
    from fantasy_api.schemas.scraped import ScrapedMatch, ScrapedMatches
    from fantasy_api.services.player_stats import _apply_recent_dates

    wire = parse_wire_document({"fixtures": [], "matches": {"recent": [], "upcoming": []}})
    wire = wire.model_copy(
        update={
            "matches": ScrapedMatches(
                recent=[
                    ScrapedMatch(
                        date=date(2026, 9, 19),
                        matchweek=7,
                        home_score=1,
                        away_score=3,
                    )
                ]
            )
        }
    )
    row = FixtureStatsRow(
        fixture=FixtureRef(
            date=None,
            competition=Competition.LALIGA,
            matchweek=7,
            home_score=1,
            away_score=3,
        ),
        stats=FixtureStats(),
    )
    filled = _apply_recent_dates([row], wire)
    assert filled[0].fixture.date == date(2026, 9, 19)
