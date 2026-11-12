"""Read-only lineup planning contracts and immutable engine inputs."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, RootModel, model_validator

from fantasy_api.schemas.common import FlexibleModel
from fantasy_api.schemas.player_stats import NewsItem

Source = Literal["owned", "market", "opponents"]
FREE_FORMATIONS = ("5,4,1", "5,3,2", "4,5,1", "4,4,2", "4,3,3", "3,5,2", "3,4,3")
PREMIUM_FORMATIONS = ("5,2,3", "4,6,0", "4,2,4", "3,6,1", "3,3,4")


class ExplanationPreferences(BaseModel):
    """Optional prose settings; credentials and model remain server-owned."""

    model_config = ConfigDict(extra="forbid")
    enabled: bool = False
    reasoning_effort: Literal["low", "medium", "high"] | None = None


class BuildPreferences(BaseModel):
    """Validated builder preferences; all selected players are mandatory."""

    model_config = ConfigDict(extra="forbid")
    sources: list[Source] = Field(default_factory=lambda: ["owned"], min_length=1, max_length=3)
    mandatory_player_ids: list[str] = Field(default_factory=list, max_length=11)
    formations: list[str] = Field(default_factory=list, max_length=12)
    allow_buying: bool = False
    allow_selling: bool = False
    include_trading_purchases: bool = False
    require_nonnegative_cash: bool = False
    allow_immediate_sale: bool = False
    bid_strategy: Literal["market_value", "max_profitable"] = "market_value"
    min_bid_return: Decimal | None = Field(default=None, ge=0, le=1)
    max_candidates: int = Field(default=5, ge=1, le=20, strict=True)
    explanation: ExplanationPreferences = Field(default_factory=ExplanationPreferences)

    @model_validator(mode="after")
    def validate_choices(self) -> "BuildPreferences":
        """Reject duplicate identities, unsupported tactics and inconsistent options."""
        for values in (self.sources, self.mandatory_player_ids, self.formations):
            if len(set(values)) != len(values):
                raise ValueError("choices must be unique")
        if any(not value.strip() or value != value.strip() for value in self.mandatory_player_ids):
            raise ValueError("mandatory player ids must be nonempty and trimmed")
        if set(self.formations) - set(FREE_FORMATIONS + PREMIUM_FORMATIONS):
            raise ValueError("unsupported formation")
        if self.include_trading_purchases and not self.allow_buying:
            raise ValueError("trading purchases require buying permission")
        if self.explanation.reasoning_effort and not self.explanation.enabled:
            raise ValueError("reasoning effort requires explanations")
        if self.require_nonnegative_cash and not self.allow_selling:
            raise ValueError("a non-negative balance requires selling permission")
        if self.allow_immediate_sale and not self.allow_selling:
            raise ValueError("immediate sales require selling permission")
        if self.min_bid_return is not None and self.bid_strategy != "max_profitable":
            raise ValueError("a minimum bid return requires the max_profitable bid strategy")
        return self


class Criterion(FlexibleModel):
    """One scored rule family with achievable bounds and source evidence."""

    rule_id: str
    source: str
    observed: str
    lineup: Decimal | None = None
    trading: Decimal | None = None
    lineup_lower: Decimal = Decimal(0)
    lineup_upper: Decimal = Decimal(0)
    trading_lower: Decimal = Decimal(0)
    trading_upper: Decimal = Decimal(0)


class SectionScore(FlexibleModel):
    """Independent normalized axes and redistributed lineup weight."""

    section: str
    criteria: list[Criterion]
    lineup_raw: Decimal
    trading_raw: Decimal
    lineup_lower: Decimal
    lineup_upper: Decimal
    trading_lower: Decimal
    trading_upper: Decimal
    lineup_normalized: Decimal
    trading_normalized: Decimal
    effective_weight: Decimal


class BidSuggestion(FlexibleModel):
    """Suggested market bid and the evidence behind it; never placed by the builder."""

    strategy: Literal["market_value", "max_profitable"]
    amount: int = Field(ge=0)
    default_bid: int = Field(ge=0)
    competing_bids: int = Field(ge=0)
    mpb: int | None = None
    return_rate: Decimal | None = None
    min_return: Decimal | None = None
    status: Literal["default", "profitable", "non_profitable", "insufficient_history"]


class ScoredPlayer(FlexibleModel):
    """Master identity, eligibility and executable read-only route metadata."""

    player_id: str
    name: str
    position: int = Field(ge=1, le=4)
    club_id: int
    source: Source
    player_team_id: str | None = None
    market_value: int = Field(ge=0)
    lineup_score: Decimal
    trading_score: Decimal
    combined_score: Decimal
    sections: list[SectionScore] = Field(default_factory=list)
    omissions: list[str] = Field(default_factory=list)
    news: list[NewsItem] = Field(default_factory=list)
    protection_advice: bool = False
    acquisition_method: Literal["bid", "clause"] | None = None
    settlement_at: AwareDatetime | None = None
    clause_price: int | None = None
    sale_settlement_at: AwareDatetime | None = None
    sale_offer_id: str | None = None
    sale_offer_amount: int | None = Field(default=None, ge=0)
    sale_offer_expires_at: AwareDatetime | None = None
    listed_for_sale: bool = False
    competing_bids: int | None = Field(default=None, ge=0)
    bid_suggestion: BidSuggestion | None = None


class TargetWeek(FlexibleModel):
    """Verified first kickoff; every transaction deadline derives from it."""

    week: int
    first_kickoff: AwareDatetime
    sales_deadline: AwareDatetime
    clauses_deadline: AwareDatetime
    protection_deadline: AwareDatetime


class TradeAlternative(FlexibleModel):
    """Lower-certainty route shown beside a step; never counted in projected cash."""

    method: Literal["direct_offer"]
    suggested_amount: int = Field(ge=0)
    conditions: list[str]


class TradeStep(FlexibleModel):
    """Conditional estimate with balances after settlement.

    ``conditions`` holds machine-readable codes (for example ``below_market_value``,
    ``loses_half_market_value``, ``non_profitable`` or ``insufficient_history``).
    """

    action: Literal["sell", "buy"]
    player_id: str
    player_team_id: str | None = None
    method: str
    estimate: int
    settlement_at: AwareDatetime
    cash_after: int
    squad_value_after: int
    squad_count_after: int
    debt_limit: int
    conditions: list[str]
    market_value: int | None = None
    offer_id: str | None = None
    offer_expires_at: AwareDatetime | None = None
    bid_suggestion: BidSuggestion | None = None
    alternatives: list[TradeAlternative] = Field(default_factory=list)


class ListingSuggestion(FlexibleModel):
    """Owned non-starter worth listing; listing money is never counted as cash."""

    player_id: str
    player_team_id: str
    suggested_price: int = Field(ge=0)
    reason: Literal["not_listed", "listed_without_offer"]


class TradePlan(FlexibleModel):
    """Whole execution-time squad projection, including retained bench."""

    acquisitions: list[ScoredPlayer]
    trading_purchases: list[ScoredPlayer]
    sales: list[ScoredPlayer]
    steps: list[TradeStep]
    retained_player_ids: list[str]
    resulting_player_ids: list[str]
    projected_cash: int
    squad_value: int
    squad_count: int
    reserved_squad_slots: int = Field(default=0, ge=0)
    funding_status: Literal["funded", "debt_within_limit", "needs_sales"] = "funded"
    final_floor: int = 0
    shortfall: int = Field(default=0, ge=0)
    listing_suggestions: list[ListingSuggestion] = Field(default_factory=list)


class Candidate(FlexibleModel):
    """Ranked XI and conditional trades; never an upstream write."""

    candidate_id: str
    formation: str
    resource_group: Literal["owned", "external"]
    starters: list[ScoredPlayer]
    total_lineup_score: Decimal
    tie_break: float
    trading_plan: TradePlan


class BuilderDiagnostic(FlexibleModel):
    """Bounded source omission or player exclusion, without raw provider bodies."""

    code: str
    player_id: str | None = None


class BuildResponse(FlexibleModel):
    """Replayable recommendations and truthful bounded-search status."""

    build_id: str
    rules_version: str = "2026-10-15.1"
    generated_at: datetime
    league_id: str
    team_id: str
    target: TargetWeek
    random_seed: int
    search_complete: bool
    search_limit_reason: str | None = None
    evaluated_states: int
    evaluated_players: int
    candidates: list[Candidate]
    diagnostics: list[BuilderDiagnostic]
    explanation_status: str = "disabled"
    explanations: dict[str, str] = Field(default_factory=dict)


class BuildFailure(FlexibleModel):
    """Sanitized build conflict with bounded player/source reasons."""

    error: str
    detail: str
    diagnostics: list[BuilderDiagnostic] = Field(default_factory=list, max_length=200)


class BuildProgress(FlexibleModel):
    """Stage-weighted work estimate; player counts measure finished evaluations."""

    stage: Literal["sources", "players", "trades", "search", "explanation", "complete"]
    percent: int = Field(ge=0, le=100)
    completed_players: int = Field(default=0, ge=0)
    total_players: int = Field(default=0, ge=0)


class BuildProgressEvent(FlexibleModel):
    """One progress update in an authenticated JSON-lines response."""

    type: Literal["progress"] = "progress"
    progress: BuildProgress


class BuildResultEvent(FlexibleModel):
    """Terminal successful result; only this event completes the build."""

    type: Literal["result"] = "result"
    result: BuildResponse


class BuildErrorEvent(FlexibleModel):
    """Terminal sanitized failure after streaming headers have been sent."""

    type: Literal["error"] = "error"
    status: int = Field(ge=400, le=599)
    error: str
    diagnostics: list[BuilderDiagnostic] = Field(default_factory=list, max_length=200)


class BuildStreamEvent(
    RootModel[
        Annotated[
            BuildProgressEvent | BuildResultEvent | BuildErrorEvent, Field(discriminator="type")
        ]
    ]
):
    """One newline-delimited event, ending with exactly one result or error."""
