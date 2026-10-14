"""Versioned workflow boundary policies; these are builder suitability rules."""

from decimal import ROUND_HALF_UP, Decimal


def club_points(position: int) -> int:
    """Return league-position suitability points."""
    return next(
        points
        for end, points in ((1, 3), (4, 2), (7, 1), (12, 0), (17, -1), (20, -2))
        if position <= end
    )


def opponent_points(position: int) -> int:
    """Return target-opponent difficulty points."""
    return next(
        points
        for end, points in ((1, -10), (4, -5), (7, -3), (12, 0), (17, 3), (20, 5))
        if position <= end
    )


def fantasy_average(value: Decimal) -> int:
    """Resolve overlapping published average boundaries consistently."""
    if value > 10:
        return 3
    if value > Decimal("7.5"):
        return 2
    if value >= 5:
        return 1
    return next(
        points
        for end, points in (
            (Decimal("1.5"), -3),
            (Decimal("2.5"), -2),
            (Decimal(4), -1),
            (Decimal(5), 0),
        )
        if value < end
    )


def dazn_average(value: Decimal) -> int:
    """Score played-match DAZN averages without counting absences as zero."""
    if value > Decimal("2.5"):
        return 5
    if value >= 2:
        return 3
    if value >= Decimal("1.5"):
        return 2
    return 1 if value >= 1 else 0


def probability_points(value: int) -> int:
    """Score integer starting probabilities, including exact 50 and 60."""
    return next(
        points
        for start, points in (
            (91, 5),
            (81, 3),
            (61, 2),
            (51, 1),
            (50, 0),
            (40, -1),
            (30, -3),
            (0, -5),
        )
        if value >= start
    )


def market_change(value: Decimal) -> int:
    """Score five-day relative growth with workflow endpoint inclusivity."""
    for start, points in ((".10", 10), (".07", 7), (".05", 5), (".025", 3)):
        if value >= Decimal(start):
            return points
    if value > Decimal(".01"):
        return 1
    if value >= Decimal("-.01"):
        return -1
    if value > Decimal("-.025"):
        return -3
    if value >= Decimal("-.05"):
        return -5
    if value >= Decimal("-.07"):
        return -7
    return -10


def expensive_penalty(value: int) -> int:
    """Return the low-growth value penalty in whole euros."""
    for end, points in ((10, 0), (15, -1), (25, -2), (50, -3), (80, -4), (120, -5)):
        if value < end * 1_000_000:
            return points
    return -8 if value <= 180_000_000 else -10


def injury_points(days: int) -> int:
    """Apply exactly one days-since-injury band."""
    return next(
        points
        for start, points in ((30, 3), (14, 1), (10, 0), (7, -1), (5, -2), (3, -3), (0, -5))
        if days >= start
    )


def rest_points(minutes: int, probability: int) -> int:
    """Round the nonzero-minute rest bonus using Decimal ROUND_HALF_UP."""
    base = 1 if minutes >= 45 else 2 if minutes >= 30 else 3
    return int(
        (Decimal(base) * Decimal(probability) / 100).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    )
