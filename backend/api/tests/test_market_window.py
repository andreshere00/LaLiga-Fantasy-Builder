# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from datetime import date, datetime

import pytest
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.domain.market_window import (
    WindowRequest,
    build_market_window,
    normalise_history,
    resolve_window_request,
)
from fantasy_api.schemas.player_stats import MarketPreset

TODAY = date(2026, 10, 3)
SEASON_START = date(2026, 7, 1)
HISTORY = [
    (date(2026, 9, 24), 100),
    (date(2026, 9, 28), 110),
    (date(2026, 9, 30), 110),
    (date(2026, 10, 3), 120),
]


# ---- Happy path ---- #


def test_build_market_window_preset_5d_full() -> None:
    request = resolve_window_request(
        preset=MarketPreset.D5,
        from_=None,
        to=None,
        today=TODAY,
        season_start=SEASON_START,
        history=HISTORY,
    )
    window, _warnings = build_market_window(
        HISTORY,
        request=request,
        today=TODAY,
        season_start=SEASON_START,
    )
    assert window.from_ == date(2026, 9, 28)
    assert len(window.series) == 6
    assert window.delta_abs == 10


def test_build_market_window_zero_start_adds_warning() -> None:
    history = [(date(2026, 9, 28), 0), (date(2026, 10, 3), 50)]
    request = WindowRequest(
        preset=MarketPreset.D5,
        from_=date(2026, 9, 28),
        to=date(2026, 10, 3),
    )
    window, warnings = build_market_window(
        history,
        request=request,
        today=TODAY,
        season_start=SEASON_START,
    )
    assert window.delta_rel is None
    assert any(item.code == "zero_start_value" for item in warnings)


# ---- Error paths ---- #


def test_normalise_history_all_invalid_raises() -> None:
    with pytest.raises(UpstreamError):
        normalise_history([{"date": "bad", "marketValue": "x"}])


# ---- Edge cases ---- #


@pytest.mark.parametrize(
    ("preset", "expected_days"),
    [
        (MarketPreset.D14, 14),
        (MarketPreset.D10, 10),
        (MarketPreset.D30, 30),
    ],
)
def test_resolve_window_request_presets(preset: MarketPreset, expected_days: int) -> None:
    request = resolve_window_request(
        preset=preset,
        from_=None,
        to=None,
        today=TODAY,
        season_start=SEASON_START,
        history=HISTORY,
    )
    assert (request.to - request.from_).days == expected_days


def test_resolve_window_request_season_preset() -> None:
    request = resolve_window_request(
        preset=MarketPreset.SEASON,
        from_=None,
        to=None,
        today=TODAY,
        season_start=SEASON_START,
        history=HISTORY,
    )
    assert request.from_ == SEASON_START
    assert request.to == TODAY


def test_normalise_history_drops_invalid_and_sorts() -> None:
    history, dropped = normalise_history(
        [
            {"date": "2026-10-03", "marketValue": 120},
            {"date": "2026-09-28T12:00:00Z", "marketValue": 100.0},
            {"date": datetime(2026, 9, 30), "marketValue": 110},
            "bad",
            {"date": "2026-10-01", "marketValue": -1},
        ],
    )
    assert dropped == 2
    assert history == [
        (date(2026, 9, 28), 100),
        (date(2026, 9, 30), 110),
        (date(2026, 10, 3), 120),
    ]


def test_build_market_window_empty_history_returns_empty_series() -> None:
    request = WindowRequest(
        preset=MarketPreset.D5,
        from_=date(2026, 9, 28),
        to=date(2026, 10, 3),
    )
    window, _warnings = build_market_window(
        [],
        request=request,
        today=TODAY,
        season_start=SEASON_START,
    )
    assert window.start_value is None
    assert window.series == []
