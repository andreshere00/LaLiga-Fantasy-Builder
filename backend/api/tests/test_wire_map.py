# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from fantasy_api.schemas.player_stats import Competition, InjuryRisk, StatKey
from fantasy_api.services.wire_map import (
    competition_from_row,
    empty_fixture_stats,
    fixture_stats_from_layers,
    kickoff_datetime,
    map_injury_risk,
    parse_match_date,
    parse_wire_document,
    stats_from_fantasy_week,
    stats_from_parser_layer,
)

GOLDEN = Path(__file__).parent / "fixtures" / "scraping" / "futbolfantasy_raphinha.json"

# ---- Happy path ---- #


def test_parse_wire_document_normalises_golden_fixture() -> None:
    raw = json.loads(GOLDEN.read_text(encoding="utf-8"))
    wire = parse_wire_document(raw)
    assert wire.profile is not None
    assert wire.matches is not None
    assert len(wire.matches.recent) >= 1
    assert wire.fixtures[0].home_team == "SEV"


def test_stats_from_parser_layer_maps_camel_case_keys() -> None:
    layer = stats_from_parser_layer(
        {
            "goals": {"count": 2, "points": 20},
            "assists": {"count": 1, "points": 9},
        },
    )
    assert layer[StatKey.GOALS].count == 2
    assert layer[StatKey.ASSISTS].points == 9


def test_stats_from_parser_layer_implied_zero_drops_count() -> None:
    layer = stats_from_parser_layer(
        {
            "goalsConceded": {"count": 0, "points": None, "status": "implied_zero"},
            "goals": {"count": 1, "points": None, "status": "ok"},
        },
    )
    assert StatKey.GOALS_CONCEDED not in layer
    assert layer[StatKey.GOALS].count == 1


def test_stats_from_fantasy_week_maps_arrays() -> None:
    layer = stats_from_fantasy_week({"goals": [2, 20], "mins_played": [90]})
    assert layer[StatKey.GOALS].count == 2
    assert layer[StatKey.GOALS].points == 20
    assert layer[StatKey.MINUTES_PLAYED].points == 90


def test_fixture_stats_from_layers_merges_parser_stats() -> None:
    parser = stats_from_parser_layer({"goals": {"count": 1, "points": 10}})
    stats = fixture_stats_from_layers([parser])
    assert stats.goals.count == 1


def test_kickoff_datetime_combines_date_and_time() -> None:
    kickoff = kickoff_datetime(date(2026, 10, 18), "18:30")
    assert kickoff is not None
    assert kickoff.hour == 18
    assert kickoff.minute == 30


def test_competition_from_row_accepts_enum_value() -> None:
    assert competition_from_row("laliga") == Competition.LALIGA


def test_map_injury_risk_maps_spanish_labels() -> None:
    assert map_injury_risk("Bajo") == InjuryRisk.LOW
    assert map_injury_risk("unknown") == InjuryRisk.UNKNOWN


def test_empty_fixture_stats_returns_defaults() -> None:
    stats = empty_fixture_stats()
    assert stats.goals.count is None


# ---- Error paths ---- #


def test_parse_match_date_invalid_returns_none() -> None:
    assert parse_match_date("not-a-date") is None


# ---- Edge cases ---- #


def test_parse_match_date_accepts_date_instance() -> None:
    day = date(2026, 10, 3)
    assert parse_match_date(day) == day


def test_kickoff_datetime_invalid_time_returns_none() -> None:
    assert kickoff_datetime(date(2026, 10, 18), "bad") is None


def test_kickoff_datetime_trailing_h_returns_madrid_datetime() -> None:
    kickoff = kickoff_datetime(date(2026, 10, 10), "18:30h")
    assert kickoff is not None
    assert kickoff.hour == 18


def test_normalise_match_missing_side_keeps_is_home_null() -> None:
    wire = parse_wire_document(
        {
            "fixtures": [],
            "matches": {
                "recent": [
                    {
                        "date": "2026-09-16",
                        "score": {"home": 7, "away": 2},
                        "minutes": {"raw": "68'", "minutes": 68, "event": "full"},
                    }
                ],
                "upcoming": [],
            },
            "profile": {},
        },
    )
    assert wire.matches.recent[0].is_home is None


def test_stats_from_parser_layer_skips_non_mappings() -> None:
    assert stats_from_parser_layer({"goals": "bad"}) == {}


def test_parse_wire_document_normalises_profile_injury_history_dict() -> None:
    wire = parse_wire_document(
        {
            "fixtures": [],
            "matches": {"recent": [], "upcoming": []},
            "profile": {
                "injuryHistory": {"entries": [{"start": "2026-01-01"}]},
            },
        },
    )
    assert wire.profile is not None
    assert wire.profile.injury_history == [{"start": "2026-01-01"}]


def test_normalise_fixture_minutes_as_int() -> None:
    wire = parse_wire_document(
        {
            "fixtures": [
                {
                    "matchday": 1,
                    "minutesOut": 90,
                    "match": {"homeCode": "A", "awayCode": "B"},
                    "stats": {"goals": {"count": 0, "points": 0}},
                },
            ],
            "matches": {"recent": [], "upcoming": []},
            "profile": {},
        },
    )
    assert wire.fixtures[0].minutes == 90
