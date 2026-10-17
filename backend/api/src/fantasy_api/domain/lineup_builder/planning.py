"""Conditional market-value projections, checked at every settlement stage."""

from datetime import datetime

from fantasy_api.schemas.lineup_builder import (
    BuildPreferences,
    ScoredPlayer,
    TargetWeek,
    TradePlan,
    TradeStep,
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
        cash: Verified cash, or explicitly labeled conservative cash after bid reserves.
        preferences: Buy/sell permissions.
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
    value = sum(p.market_value for p in owned)
    count = len(owned)
    sales: list[ScoredPlayer] = []
    salable = (
        sorted(
            (
                p
                for p in owned
                if p.player_id not in ids
                and p.sections
                and p.sale_settlement_at is not None
                and now <= p.sale_settlement_at <= target.sales_deadline
            ),
            key=lambda p: (p.trading_score, p.player_id),
        )
        if preferences.allow_selling
        else []
    )
    cost = sum(p.market_value for p in purchases)
    projected = cash - cost
    final_count = count + len(purchases)
    for player in salable:
        if projected >= 0 and final_count + reserved_squad_slots <= 24:
            break
        sales.append(player)
        projected += player.market_value
        final_count -= 1
    if projected < 0 or final_count + reserved_squad_slots > 24:
        return None
    steps: list[TradeStep] = []
    latest_sale = max((p.sale_settlement_at for p in sales), default=now)
    for player in sales:
        cash += player.market_value
        value -= player.market_value
        count -= 1
        if cash < -(value // 5):
            return None
        steps.append(
            TradeStep(
                action="sell",
                player_id=player.player_id,
                method="accepted_offer",
                estimate=player.market_value,
                settlement_at=player.sale_settlement_at,
                cash_after=cash,
                squad_value_after=value,
                squad_count_after=count,
                debt_limit=value // 5,
                conditions=[
                    "Existing offer must be accepted and settled before the sale deadline",
                    "Proceeds are a current-market-value estimate",
                ],
            )
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
        if player.acquisition_method == "clause":
            settlement = max(settlement, last_settlement)
            if settlement >= target.clauses_deadline or player.market_value > cash:
                return None
        elif settlement >= target.first_kickoff or settlement < last_settlement:
            return None
        if player.market_value > cash + (value // 5):
            return None
        cash -= player.market_value
        value += player.market_value
        count += 1
        if count + reserved_squad_slots > 24 or cash < -(value // 5):
            return None
        conditions = [
            "Acquisition estimate uses current market value",
            "Refresh cash, ownership and restrictions before any manual transaction",
        ]
        conditions.append(
            "Winning bid and assignment are required"
            if player.acquisition_method == "bid"
            else "Actual clause price must be payable entirely from cash"
        )
        steps.append(
            TradeStep(
                action="buy",
                player_id=player.player_id,
                method=player.acquisition_method,
                estimate=player.market_value,
                settlement_at=settlement,
                cash_after=cash,
                squad_value_after=value,
                squad_count_after=count,
                debt_limit=0 if player.acquisition_method == "clause" else value // 5,
                conditions=conditions,
            )
        )
        last_settlement = settlement
    if cash < 0 or count + reserved_squad_slots > 24:
        return None
    sold = {p.player_id for p in sales}
    retained = [p.player_id for p in owned if p.player_id not in sold]
    return TradePlan(
        acquisitions=[p for p in purchases if p.player_id in ids],
        trading_purchases=extras,
        sales=sales,
        steps=steps,
        retained_player_ids=retained,
        resulting_player_ids=retained + [p.player_id for p in purchases],
        projected_cash=cash,
        squad_value=value,
        squad_count=count,
        reserved_squad_slots=reserved_squad_slots,
    )
