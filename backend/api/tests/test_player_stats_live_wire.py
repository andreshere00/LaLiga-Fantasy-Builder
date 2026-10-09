# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock

from fantasy_api.domain.venues import default_venue_directory
from fantasy_api.schemas.player_stats import MatchResult
from fantasy_api.services.player_stats import (
    PlayerStatsService,
    _match_result,
    _started_from_minutes_event,
)
from fantasy_api.services.wire_map import kickoff_datetime, parse_wire_document
from test_container import test_settings as api_test_settings

LIVE = Path(__file__).parent / "fixtures" / "scraping" / "futbolfantasy_raphinha_live.json"


class _FixedClock:
    def __init__(self, moment: object) -> None:
        self._moment = moment

    def __call__(self) -> object:
        return self._moment


# ---- Happy path ---- #


def test_player_stats_live_wire_home_win_and_kickoff() -> None:
    wire = parse_wire_document(json.loads(LIVE.read_text(encoding="utf-8")))
    home_row = next(row for row in wire.matches.recent if row.date == date(2026, 9, 16))
    assert home_row.is_home is True
    assert _match_result(home_row.is_home, home_row.home_score, home_row.away_score) == (
        MatchResult.WIN
    )
    upcoming = wire.matches.upcoming[0]
    kickoff = kickoff_datetime(upcoming.date, upcoming.kickoff_time)
    assert kickoff is not None
    assert kickoff.day == 10


def test_travel_home_without_opponent_returns_zero() -> None:
    from datetime import UTC, datetime

    service = PlayerStatsService(
        resolver=MagicMock(),
        players=MagicMock(),
        calendar=MagicMock(),
        scraped=MagicMock(),
        stats_repo=MagicMock(),
        venues=default_venue_directory(),
        clock=_FixedClock(datetime(2026, 10, 5, 12, 0, tzinfo=UTC)),
        settings=api_test_settings(),
    )
    home = service._venues.for_club(fantasy_id=4, name=None)
    travel = service._travel(home, True, None)
    assert travel.distance_km == 0.0
    assert travel.player_team_travels is False


# ---- Edge cases ---- #


def test_started_from_minutes_event_maps_full_match() -> None:
    assert _started_from_minutes_event("full") is True
    assert _started_from_minutes_event("unknown") is None
