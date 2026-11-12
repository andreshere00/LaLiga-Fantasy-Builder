"""Default bids and the Maximum Profitable Bid (MPB) used by the lineup builder."""

# ---- Mocks, fixtures & helpers ---- #

from datetime import date, timedelta
from decimal import Decimal

import pytest
from fantasy_api.domain.lineup_builder.bidding import (
    MPB_WEIGHTS,
    HistoryPoint,
    default_bid,
    horizon_values,
    max_profitable_bid,
    suggest_bid,
)

REFERENCE = date(2026, 11, 12)
# Fermín López (player 1715), Annex A of the trade-aware drafting brief.
FERMIN = {
    0: 123_892_243,
    3: 114_407_842,
    5: 111_069_182,
    7: 108_138_089,
    10: 101_970_432,
    14: 97_175_219,
}


def series(values: dict[int, int], *, filled: set[int] = frozenset()) -> list[HistoryPoint]:
    """Build a 15-day series, interpolating days that are not horizons."""
    return [
        HistoryPoint(
            day=REFERENCE - timedelta(days=offset),
            value=values.get(offset, 100_000_000),
            filled=offset in filled,
        )
        for offset in range(15)
    ]


# ---- Happy path ---- #


def test_mpb_weights_sum_to_one() -> None:
    assert sum(MPB_WEIGHTS) == 1


def test_max_profitable_bid_worked_example_returns_138192502() -> None:
    choice = suggest_bid(123_892_243, 0, "max_profitable", Decimal(0), FERMIN)

    assert choice.status == "profitable"
    assert choice.mpb == 138_192_502
    assert choice.amount == 138_192_502
    assert choice.return_rate is not None
    assert choice.return_rate.quantize(Decimal("0.000001")) == Decimal("0.115425")


def test_max_profitable_bid_worked_example_exact_decimal() -> None:
    result = max_profitable_bid(FERMIN)

    assert result is not None
    assert result.amount.quantize(Decimal("0.01")) == Decimal("138192502.25")


def test_horizon_values_exact_points_returns_every_horizon() -> None:
    values = horizon_values(series(FERMIN), REFERENCE)

    assert values == FERMIN


def test_default_bid_without_competing_bids_returns_market_value() -> None:
    assert default_bid(1_000_000, 0) == 1_000_000


def test_default_bid_with_competing_bids_returns_market_value_plus_one() -> None:
    assert default_bid(1_000_000, 1) == 1_000_001
    assert default_bid(1_000_000, 4) == 1_000_001


def test_suggest_bid_market_value_strategy_returns_default_status() -> None:
    choice = suggest_bid(500, 2, "market_value", values=FERMIN)

    assert choice.amount == 501
    assert choice.status == "default"
    assert choice.mpb is None


# ---- Error paths ---- #


def test_max_profitable_bid_return_below_threshold_returns_non_profitable() -> None:
    choice = suggest_bid(123_892_243, 0, "max_profitable", Decimal("0.2"), FERMIN)

    assert choice.status == "non_profitable"
    assert choice.amount == 123_892_243
    assert choice.mpb == 138_192_502


def test_max_profitable_bid_falling_value_returns_non_profitable() -> None:
    falling = {0: 100, 3: 110, 5: 120, 7: 130, 10: 140, 14: 150}

    choice = suggest_bid(100, 1, "max_profitable", Decimal(0), falling)

    assert choice.status == "non_profitable"
    assert choice.amount == 101


def test_max_profitable_bid_gap_filled_history_returns_insufficient_history() -> None:
    values = horizon_values(series(FERMIN, filled={7}), REFERENCE)

    choice = suggest_bid(123_892_243, 0, "max_profitable", Decimal(0), values)

    assert values is None
    assert choice.status == "insufficient_history"
    assert choice.amount == 123_892_243


def test_horizon_values_missing_point_returns_none() -> None:
    points = [p for p in series(FERMIN) if p.day != REFERENCE - timedelta(days=14)]

    assert horizon_values(points, REFERENCE) is None


@pytest.mark.parametrize("current", [0, -1])
def test_max_profitable_bid_nonpositive_current_value_returns_none(current: int) -> None:
    assert max_profitable_bid({**FERMIN, 0: current}) is None


# ---- Edge cases ---- #


def test_max_profitable_bid_below_default_bid_returns_default_bid() -> None:
    flat = {0: 100, 3: 100, 5: 100, 7: 100, 10: 100, 14: 100}

    choice = suggest_bid(100, 3, "max_profitable", Decimal(0), flat)

    assert choice.status == "profitable"
    assert choice.mpb == 100
    assert choice.amount == 101


def test_max_profitable_bid_return_equal_to_threshold_is_profitable() -> None:
    flat = {0: 100, 3: 100, 5: 100, 7: 100, 10: 100, 14: 100}

    assert suggest_bid(100, 0, "max_profitable", Decimal(0), flat).status == "profitable"
