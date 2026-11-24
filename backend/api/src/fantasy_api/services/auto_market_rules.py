"""Pure threshold arithmetic for auto-market rules; no I/O so it stays exhaustively testable."""

from __future__ import annotations

from typing import Literal

from fantasy_api.schemas.market import MarketOffer

BASIS_POINTS = 10_000


def percent_to_bps(percent: float) -> int:
    """Convert a percentage with at most two decimals into whole basis points."""
    return round(percent * 100)


def threshold_amount(
    side: Literal["sell", "buy"],
    kind: Literal["relative", "absolute", "none"],
    baseline: int,
    *,
    bps: int | None = None,
    amount: int | None = None,
) -> int:
    """Return the market value a rule waits for.

    Relative sells round up and relative buys round down, so the rule never fires on a
    value that is short of the confirmed percentage. A list-only rule waits for nothing, so its
    threshold is the baseline.
    """
    if kind == "none":
        return baseline
    if kind == "absolute":
        assert amount is not None
        return amount
    assert bps is not None
    if side == "sell":
        return -(-baseline * (BASIS_POINTS + bps) // BASIS_POINTS)
    return max(1, baseline * (BASIS_POINTS - bps) // BASIS_POINTS)


MAX_SQUAD_PLAYERS = 24
MAX_DEBT_RATIO = 0.2
MAX_LISTING_PRICE = 999_999_999
PENDING_STATUS = "pending"


def threshold_reached(side: Literal["sell", "buy"], threshold: int, value: int) -> bool:
    """Sells wait for the value to rise to the threshold, buys for it to fall to it."""
    return value >= threshold if side == "sell" else value <= threshold


def listing_price(
    threshold: int, price_mode: Literal["threshold", "market_value"], value: int
) -> int:
    """Return the asking price: never below the market value Fantasy requires."""
    wanted = threshold if price_mode == "threshold" else value
    return min(MAX_LISTING_PRICE, max(value, wanted))


def accept_floor(
    threshold: int, price_mode: Literal["threshold", "market_value"], value: int
) -> int:
    """Lowest offer that is accepted at once: the confirmed threshold or the value at firing."""
    return threshold if price_mode == "threshold" else value


def bid_amount(
    threshold: int,
    price_mode: Literal["threshold", "market_value"],
    custom: int | None,
    value: int,
) -> int:
    """Return the bid: the market value, or the custom or threshold amount, never below value."""
    if price_mode == "market_value":
        return value
    return max(value, custom or threshold)


def bid_limit(money: int, squad_value: int) -> int:
    """Whole-euro bidding limit: cash plus 20% of the squad market value."""
    return int(money + max(0, squad_value) * MAX_DEBT_RATIO)


def best_offer(offers: list[MarketOffer], floor: int) -> MarketOffer | None:
    """Pick the highest pending offer at or above the floor; unknown status fails closed."""
    usable = [
        offer
        for offer in offers
        if str(offer.status or "").lower() == PENDING_STATUS
        and offer.money is not None
        and offer.money >= floor
        and offer.id is not None
        and offer.market_id is not None
    ]
    return max(usable, key=lambda offer: offer.money or 0, default=None)
