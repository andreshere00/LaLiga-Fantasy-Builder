"""Conditional trade projections, checked at every settlement stage.

Financial rules (rules version ``2026-11-12.1``):

* The running balance never drops below ``min(starting cash, 0, -(squad value // 5))``.
* Without ``require_nonnegative_cash`` the final balance may end in debt, down to the same
  floor computed on the final squad value.
* With ``require_nonnegative_cash`` the plan sells until the balance is at least 0. When
  confirmed sales cannot reach 0, listing suggestions must cover the shortfall; listing money
  is never counted in projected cash.
"""

from datetime import datetime
from typing import Literal

from fantasy_api.schemas.lineup_builder import (
    BuildPreferences,
    ListingSuggestion,
    ScoredPlayer,
    TargetWeek,
    TradeAlternative,
    TradePlan,
    TradeStep,
)

SaleMethod = Literal["accept_offer", "immediate_sale"]
SQUAD_CAP = 24


def purchase_cost(player: ScoredPlayer) -> int:
    """Return the amount a purchase is expected to cost: the suggested bid, if any."""
    if player.acquisition_method == "bid" and player.bid_suggestion is not None:
        return player.bid_suggestion.amount
    return player.market_value


def sale_proceeds(player: ScoredPlayer, method: SaleMethod) -> int:
    """Return the cash a confirmed sale adds: the offer amount, or half the market value."""
    if method == "immediate_sale":
        return player.market_value // 2
    return player.sale_offer_amount if player.sale_offer_amount is not None else player.market_value


def sale_routes(
    owned: list[ScoredPlayer],
    excluded_ids: set[str],
    preferences: BuildPreferences,
    now: datetime,
    target: TargetWeek,
) -> list[tuple[ScoredPlayer, SaleMethod]]:
    """List funding sales in planner order: accepted offers first, then immediate sales.

    Args:
        owned: Entire roster.
        excluded_ids: Players that must be kept (the selected starters).
        preferences: Selling and immediate-sale permissions.
        now: Snapshot instant.
        target: Verified deadlines.

    Returns:
        Route A players by ascending trading score, then route B players (only when
        immediate sales are enabled) by trading score, lost value and player id.
    """
    if not preferences.allow_selling:
        return []
    candidates = [p for p in owned if p.player_id not in excluded_ids and p.sections]
    offers = sorted(
        (
            p
            for p in candidates
            if p.sale_settlement_at is not None
            and now <= p.sale_settlement_at <= target.sales_deadline
        ),
        key=lambda p: (p.trading_score, p.player_id),
    )
    immediate = (
        sorted(
            (
                p
                for p in candidates
                if p.sale_settlement_at is None
                and p.player_team_id
                and now <= target.sales_deadline
            ),
            key=lambda p: (p.trading_score, p.market_value - p.market_value // 2, p.player_id),
        )
        if preferences.allow_immediate_sale
        else []
    )
    return [(p, "accept_offer") for p in offers] + [(p, "immediate_sale") for p in immediate]


def _listing_suggestions(
    owned: list[ScoredPlayer], excluded_ids: set[str], shortfall: int
) -> list[ListingSuggestion] | None:
    """Pick the fewest low-trading-score non-starters whose listing could cover the gap."""
    suggestions: list[ListingSuggestion] = []
    covered = 0
    for player in sorted(
        (p for p in owned if p.player_id not in excluded_ids and p.player_team_id),
        key=lambda p: (p.trading_score, p.player_id),
    ):
        if covered >= shortfall:
            break
        if player.market_value <= 0:
            continue
        suggestions.append(
            ListingSuggestion(
                player_id=player.player_id,
                player_team_id=player.player_team_id,
                suggested_price=player.market_value,
                reason="listed_without_offer" if player.listed_for_sale else "not_listed",
            )
        )
        covered += player.market_value
    return suggestions if covered >= shortfall else None


def _sale_step(
    player: ScoredPlayer,
    method: SaleMethod,
    settlement: datetime,
    cash: int,
    value: int,
    count: int,
) -> TradeStep:
    """Describe one confirmed sale with the balances after it settles."""
    proceeds = sale_proceeds(player, method)
    if method == "immediate_sale":
        conditions = ["loses_half_market_value", "cannot_be_undone"]
    else:
        conditions = ["offer_acceptance_required"]
        if proceeds < player.market_value:
            conditions.append("below_market_value")
    return TradeStep(
        action="sell",
        player_id=player.player_id,
        player_team_id=player.player_team_id,
        method=method,
        estimate=proceeds,
        settlement_at=settlement,
        cash_after=cash,
        squad_value_after=value,
        squad_count_after=count,
        debt_limit=value // 5,
        conditions=conditions,
        market_value=player.market_value,
        offer_id=player.sale_offer_id if method == "accept_offer" else None,
        offer_market_id=player.sale_offer_market_id if method == "accept_offer" else None,
        offer_expires_at=player.sale_offer_expires_at if method == "accept_offer" else None,
    )


def _buy_step(
    player: ScoredPlayer, settlement: datetime, cash: int, value: int, count: int
) -> TradeStep:
    """Describe one purchase at its suggested amount, with conditional alternatives."""
    conditions = ["refresh_before_transaction"]
    alternatives: list[TradeAlternative] = []
    if player.acquisition_method == "bid":
        conditions.append("winning_bid_required")
        suggestion = player.bid_suggestion
        if suggestion is not None and suggestion.status == "insufficient_history":
            conditions.append(suggestion.status)
    else:
        conditions.append("clause_paid_from_cash")
        # A direct offer depends on the seller: shown, never counted toward funding.
        alternatives.append(
            TradeAlternative(
                method="direct_offer",
                suggested_amount=player.market_value,
                conditions=["seller_acceptance_required", "not_counted_in_cash"],
            )
        )
    return TradeStep(
        action="buy",
        player_id=player.player_id,
        player_team_id=player.player_team_id,
        method=player.acquisition_method or "bid",
        estimate=purchase_cost(player),
        settlement_at=settlement,
        cash_after=cash,
        squad_value_after=value,
        squad_count_after=count,
        debt_limit=0 if player.acquisition_method == "clause" else value // 5,
        conditions=conditions,
        market_value=player.market_value,
        bid_suggestion=player.bid_suggestion,
        alternatives=alternatives,
    )


def plan_trades(
    starters: list[ScoredPlayer],
    owned: list[ScoredPlayer],
    cash: int,
    preferences: BuildPreferences,
    target: TargetWeek,
    now: datetime,
    extras: list[ScoredPlayer] | None = None,
    reserved_squad_slots: int = 0,
) -> TradePlan | None:
    """Evaluate one XI against the entire current roster and conditional trade routes.

    Args:
        starters: Selected XI, containing unique master IDs.
        owned: Entire execution-time roster, including rejected starters.
        cash: Verified cash, or explicitly labeled conservative cash after bid reserves. It can
            already be negative (pending bids counted as spent).
        preferences: Buy/sell permissions and the funding options.
        target: Verified deadlines.
        now: Snapshot instant.
        extras: Optional trading-only purchases, also included in squad accounting.
        reserved_squad_slots: Pending assignments reserved against the 24-player cap.

    Returns:
        A feasible conditional projection, or None when constraints fail.
    """
    extras = extras or []
    ids = {p.player_id for p in starters}
    purchases = sorted(
        [p for p in starters if p.source != "owned"] + extras,
        key=lambda p: (-p.trading_score, p.player_id),
    )
    if purchases and not preferences.allow_buying:
        return None
    if len({p.player_id for p in owned}) != len(owned):
        return None
    if len({p.player_id for p in purchases}) != len(purchases):
        return None
    if any(p.player_id in {o.player_id for o in owned} for p in purchases):
        return None
    require = preferences.require_nonnegative_cash
    value = sum(p.market_value for p in owned)
    count = len(owned)

    def final_floor(squad_value: int) -> int:
        """Balance the plan must reach once every confirmed trade has settled."""
        # A balance already below the debt limit is not this XI's doing: never worsen it.
        return 0 if require else min(cash, 0, -(squad_value // 5))

    routes = sale_routes(owned, ids, preferences, now, target)
    projected = cash - sum(purchase_cost(p) for p in purchases)
    final_value = value + sum(p.market_value for p in purchases)
    final_count = count + len(purchases)
    minimum = 0
    for player, method in routes:
        if (
            projected >= final_floor(final_value)
            and final_count + reserved_squad_slots <= SQUAD_CAP
        ):
            break
        minimum += 1
        projected += sale_proceeds(player, method)
        final_value -= player.market_value
        final_count -= 1
    # The final balance fixes the fewest sales; a bid made before the last sale settles may
    # still need more cash, so add one more sale at a time until every step is legal.
    for size in range(minimum, len(routes) + 1):
        plan = _settle(
            purchases,
            routes[:size],
            owned,
            ids,
            cash,
            target,
            now,
            reserved_squad_slots,
            require,
        )
        if plan is not None:
            return plan.model_copy(update={"trading_purchases": extras})
    return None


def _settle(
    purchases: list[ScoredPlayer],
    sales: list[tuple[ScoredPlayer, SaleMethod]],
    owned: list[ScoredPlayer],
    ids: set[str],
    cash: int,
    target: TargetWeek,
    now: datetime,
    reserved_squad_slots: int,
    require: bool,
) -> TradePlan | None:
    """Replay one set of sales and purchases in settlement order and check every balance."""
    value = sum(p.market_value for p in owned)
    count = len(owned)
    running_floor = min(cash, 0)

    def debt_floor(squad_value: int) -> int:
        """Lowest legal balance for a squad value; never above an inherited balance."""
        return min(running_floor, -(squad_value // 5))

    projected = (
        cash - sum(purchase_cost(p) for p in purchases) + sum(sale_proceeds(p, m) for p, m in sales)
    )
    final_value = (
        value + sum(p.market_value for p in purchases) - sum(p.market_value for p, _ in sales)
    )
    if count + len(purchases) - len(
        sales
    ) + reserved_squad_slots > SQUAD_CAP or projected < debt_floor(final_value):
        return None
    shortfall = 0
    listings: list[ListingSuggestion] = []
    if require and projected < 0:
        # Confirmed sales fall short: listings may still cover the gap, never counted as cash.
        shortfall = -projected
        found = _listing_suggestions(owned, ids | {p.player_id for p, _ in sales}, shortfall)
        if found is None:
            return None
        listings = found
    steps: list[TradeStep] = []
    latest_sale = max((p.sale_settlement_at or now for p, _ in sales), default=now)
    for player, method in sorted(
        sales, key=lambda s: (s[0].sale_settlement_at or now, s[0].trading_score, s[0].player_id)
    ):
        cash += sale_proceeds(player, method)
        value -= player.market_value
        count -= 1
        if cash < debt_floor(value):
            return None
        steps.append(
            _sale_step(player, method, player.sale_settlement_at or now, cash, value, count)
        )
    last_settlement = latest_sale
    # Keep recommendation ranking separate from the actual settlement sequence.
    for player in sorted(
        purchases,
        key=lambda p: (
            (
                max(p.settlement_at or now, latest_sale)
                if p.acquisition_method == "clause"
                else p.settlement_at or now
            ),
            -p.trading_score,
            p.player_id,
        ),
    ):
        settlement = player.settlement_at
        if player.acquisition_method is None or settlement is None or settlement < now:
            return None
        cost = purchase_cost(player)
        if player.acquisition_method == "clause":
            settlement = max(settlement, last_settlement)
            if settlement >= target.clauses_deadline or cost > cash:
                return None
        elif settlement >= target.first_kickoff or settlement < last_settlement:
            return None
        if cost > cash + (value // 5):
            return None
        cash -= cost
        value += player.market_value
        count += 1
        if count + reserved_squad_slots > SQUAD_CAP or cash < debt_floor(value):
            return None
        steps.append(_buy_step(player, settlement, cash, value, count))
        last_settlement = settlement
    if cash < debt_floor(value) or count + reserved_squad_slots > SQUAD_CAP:
        return None
    sold_ids = {p.player_id for p, _ in sales}
    retained = [p.player_id for p in owned if p.player_id not in sold_ids]
    return TradePlan(
        acquisitions=[p for p in purchases if p.player_id in ids],
        trading_purchases=[p for p in purchases if p.player_id not in ids],
        sales=[p for p, _ in sales],
        steps=steps,
        retained_player_ids=retained,
        resulting_player_ids=retained + [p.player_id for p in purchases],
        projected_cash=cash,
        squad_value=value,
        squad_count=count,
        reserved_squad_slots=reserved_squad_slots,
        funding_status=(
            "needs_sales" if shortfall else "funded" if cash >= 0 else "debt_within_limit"
        ),
        final_floor=0 if require else debt_floor(value),
        shortfall=shortfall,
        listing_suggestions=listings,
    )
