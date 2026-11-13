"""Suggested market bids: default auction amount and the Maximum Profitable Bid (MPB)."""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_FLOOR, Decimal
from typing import Literal

BidStrategy = Literal["market_value", "max_profitable"]
BidStatus = Literal["default", "profitable", "non_profitable", "insufficient_history"]

# Lookback horizons in days and their weights; shorter horizons weigh more.
MPB_HORIZONS: tuple[int, ...] = (3, 5, 7, 10, 14)
MPB_WEIGHTS: tuple[Decimal, ...] = (
    Decimal("0.35"),
    Decimal("0.25"),
    Decimal("0.20"),
    Decimal("0.15"),
    Decimal("0.05"),
)


@dataclass(frozen=True, slots=True)
class HistoryPoint:
    """One daily market value; ``filled`` marks a gap-filled (synthetic) value."""

    day: date
    value: int
    filled: bool = False


@dataclass(frozen=True, slots=True)
class MaxProfitableBid:
    """Weighted relative return ``R`` and the unrounded ``MPB = V0 * (1 + R)``."""

    return_rate: Decimal
    amount: Decimal


@dataclass(frozen=True, slots=True)
class BidChoice:
    """Resolved bid amount with the evidence that produced it."""

    strategy: BidStrategy
    amount: int
    default_bid: int
    competing_bids: int
    mpb: int | None
    return_rate: Decimal | None
    min_return: Decimal | None
    status: BidStatus


def default_bid(market_value: int, competing_bids: int) -> int:
    """Return market value, plus 1 € when other managers have already bid.

    Args:
        market_value: Current market value in whole euros.
        competing_bids: Bids placed by other managers (the caller's own bid excluded).

    Returns:
        The default bid in whole euros.
    """
    return market_value + 1 if competing_bids >= 1 else market_value


def horizon_values(points: list[HistoryPoint], reference: date) -> dict[int, int] | None:
    """Pick ``V_0`` and ``V_t`` for every horizon from exact daily points.

    Args:
        points: Daily market-value series.
        reference: Day that counts as ``t = 0``.

    Returns:
        Values keyed by horizon (0 included), or None when any point is missing or
        gap-filled.
    """
    by_day = {point.day: point for point in points}
    values: dict[int, int] = {}
    for horizon in (0, *MPB_HORIZONS):
        point = by_day.get(reference - timedelta(days=horizon))
        if point is None or point.filled:
            return None
        values[horizon] = point.value
    return values


def max_profitable_bid(values: Mapping[int, int]) -> MaxProfitableBid | None:
    """Compute ``R = Σ α_t (V0 − V_t) / V0`` and ``MPB = V0 (1 + R)`` with Decimal.

    Args:
        values: ``V_0`` and every ``V_t`` keyed by horizon in days.

    Returns:
        The return rate and unrounded MPB, or None when the history is incomplete or
        ``V0 <= 0``.
    """
    current = values.get(0)
    if current is None or current <= 0 or any(t not in values for t in MPB_HORIZONS):
        return None
    base = Decimal(current)
    rate = sum(
        (
            weight * (base - Decimal(values[t])) / base
            for t, weight in zip(MPB_HORIZONS, MPB_WEIGHTS, strict=True)
        ),
        Decimal(0),
    )
    return MaxProfitableBid(return_rate=rate, amount=base * (1 + rate))


RATE_QUANTUM = Decimal("0.000001")


def _reported_rate(rate: Decimal) -> Decimal:
    """Round the reported return to 6 places so it never serializes in exponent form."""
    return rate.quantize(RATE_QUANTUM) + 0


def suggest_bid(
    market_value: int,
    competing_bids: int,
    strategy: BidStrategy,
    min_return: Decimal = Decimal(0),
    values: Mapping[int, int] | None = None,
) -> BidChoice:
    """Resolve the bid amount the builder suggests for one market listing.

    Args:
        market_value: Current market value in whole euros.
        competing_bids: Bids placed by other managers.
        strategy: ``market_value`` for the default bid, ``max_profitable`` for the MPB.
        min_return: Profitability threshold τ; only used by ``max_profitable``.
        values: Horizon values from :func:`horizon_values`, or None when unavailable.

    Returns:
        The suggested amount. It is never below the default bid.
    """
    fallback = default_bid(market_value, competing_bids)
    if strategy == "market_value":
        return BidChoice(strategy, fallback, fallback, competing_bids, None, None, None, "default")
    result = max_profitable_bid(values) if values is not None else None
    if result is None:
        return BidChoice(
            strategy,
            fallback,
            fallback,
            competing_bids,
            None,
            None,
            min_return,
            "insufficient_history",
        )
    mpb = int(result.amount.to_integral_value(rounding=ROUND_FLOOR))
    if result.return_rate < min_return:
        return BidChoice(
            strategy,
            fallback,
            fallback,
            competing_bids,
            mpb,
            _reported_rate(result.return_rate),
            min_return,
            "non_profitable",
        )
    return BidChoice(
        strategy,
        max(mpb, fallback),
        fallback,
        competing_bids,
        mpb,
        _reported_rate(result.return_rate),
        min_return,
        "profitable",
    )
