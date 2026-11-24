"""Armed auto-market rules: user-confirmed thresholds executed by a private worker."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from fantasy_api.schemas.market import MAX_SALE_PRICE
from fantasy_api.schemas.scouting import Identifier, PlayerId

Amount = Annotated[int, Field(strict=True, gt=0, le=MAX_SALE_PRICE)]
Side = Literal["sell", "buy"]
Target = Literal["market", "clause"]
TriggerKind = Literal["relative", "absolute", "none"]
PriceMode = Literal["threshold", "market_value"]
RuleState = Literal["armed", "listed", "executing", "executed", "failed", "cancelled", "expired"]

MAX_SELL_PERCENT = 500.0
MAX_BUY_PERCENT = 99.0
MIN_PERCENT = 0.1


class AutoMarketModel(BaseModel):
    """Camel-case application wire format with Python-native field names."""

    model_config = ConfigDict(extra="allow", alias_generator=to_camel, populate_by_name=True)


class AutoRuleWrite(AutoMarketModel):
    """Full replacement of one armed rule; arming it is the user's confirmation.

    ``playerId`` is the master footballer id. ``playerTeamId`` is the squad-entry id and is
    required to sell and to pay a clause. A relative trigger is a percentage of the market
    value when the rule is armed: sells wait for a rise, buys for a drop. A sell rule lists
    the player on the next pass when ``listNow`` is set, and then sells to an offer that reaches
    its threshold; trigger ``none`` only lists the player and never accepts an offer.
    """

    model_config = ConfigDict(extra="forbid", alias_generator=to_camel, populate_by_name=True)
    side: Side
    target: Target = "market"
    player_id: PlayerId
    player_team_id: Identifier | None = None
    trigger_kind: TriggerKind
    trigger_percent: float | None = Field(default=None, allow_inf_nan=False)
    trigger_amount: Amount | None = None
    price_mode: PriceMode = "threshold"
    bid_amount: Amount | None = None
    max_spend: Amount | None = None
    expires_at: datetime | None = None
    list_now: bool = False

    @property
    def lists_now(self) -> bool:
        """Whether a sell lists the player at once instead of waiting for its threshold."""
        return self.list_now or self.trigger_kind == "none"

    @model_validator(mode="after")
    def _coherent(self) -> AutoRuleWrite:
        """Reject combinations that could spend or sell differently from what was confirmed."""
        if self.trigger_kind == "none":
            if self.side != "sell" or self.trigger_percent is not None:
                raise ValueError("only a sell rule can list without a trigger")
            if self.trigger_amount is not None or self.price_mode != "market_value":
                raise ValueError("a list-only rule has no trigger and lists at the market value")
        elif self.trigger_kind == "relative":
            if self.trigger_percent is None or self.trigger_amount is not None:
                raise ValueError("a relative trigger takes triggerPercent only")
            ceiling = MAX_SELL_PERCENT if self.side == "sell" else MAX_BUY_PERCENT
            if not MIN_PERCENT <= self.trigger_percent <= ceiling:
                raise ValueError(f"triggerPercent must be between {MIN_PERCENT} and {ceiling:g}")
            if round(self.trigger_percent, 2) != self.trigger_percent:
                raise ValueError("triggerPercent allows at most two decimals")
        elif self.trigger_amount is None or self.trigger_percent is not None:
            raise ValueError("an absolute trigger takes triggerAmount only")
        if self.list_now and self.side != "sell":
            raise ValueError("listNow applies to sell rules only")
        if self.expires_at is not None and self.expires_at.tzinfo is None:
            raise ValueError("expiresAt must include a timezone")
        if self.side == "sell":
            if self.target != "market" or self.player_team_id is None:
                raise ValueError("a sell rule targets the market and needs playerTeamId")
            if self.max_spend is not None or self.bid_amount is not None:
                raise ValueError("maxSpend and bidAmount apply to buy rules only")
            return self
        if self.max_spend is None:
            raise ValueError("a buy rule needs maxSpend")
        if self.target == "clause":
            if self.player_team_id is None:
                raise ValueError("a clause payment needs playerTeamId")
            if self.price_mode != "threshold" or self.bid_amount is not None:
                raise ValueError("a clause is paid at its clause price")
        elif self.bid_amount is not None and self.bid_amount > self.max_spend:
            raise ValueError("bidAmount cannot exceed maxSpend")
        return self


class AutoExecution(AutoMarketModel):
    """One attempted market write; upstream bodies are never stored."""

    id: int
    rule_id: int
    action: Literal["list", "accept_offer", "bid", "pay_clause", "expire", "skip"]
    amount: int | None = None
    outcome: Literal["ok", "failed", "skipped"]
    reason: str | None = None
    created_at: datetime


class AutoRule(AutoMarketModel):
    """A stored rule with its derived target amount and latest attempt."""

    id: int
    league_id: str
    side: Side
    target: Target
    player_id: str
    player_team_id: str | None = None
    player_name: str
    trigger_kind: TriggerKind
    trigger_percent: float | None = None
    trigger_amount: int | None = None
    baseline_value: int
    threshold_amount: int
    price_mode: PriceMode
    bid_amount: int | None = None
    max_spend: int | None = None
    list_now: bool = False
    state: RuleState
    armed_at: datetime
    expires_at: datetime | None = None
    listed_price: int | None = None
    accept_floor: int | None = None
    listed_at: datetime | None = None
    last_execution: AutoExecution | None = None


class AutoRulesResponse(AutoMarketModel):
    """Rules newest first and the worker's health for the requested league."""

    rules: list[AutoRule]
    status: Literal["inactive", "active", "needs_reauth", "not_member", "degraded"] = "inactive"
    checked_at: datetime | None = None


class AutoExecutionsResponse(AutoMarketModel):
    """Newest-first attempt history for the caller's league."""

    executions: list[AutoExecution]


class AutoMarketResult(AutoMarketModel):
    """Acknowledgement for rule writes."""

    ok: bool = True
