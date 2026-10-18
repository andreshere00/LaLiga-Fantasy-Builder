"""Read-only lineup planning contracts and immutable engine inputs."""

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class FlexibleModel(BaseModel):
    """Independent application builder read contract for the auth CLI."""

    model_config = ConfigDict(extra="allow")


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
    protection_advice: bool = False
    acquisition_method: Literal["bid", "clause"] | None = None
    settlement_at: AwareDatetime | None = None
    clause_price: int | None = None
    sale_settlement_at: AwareDatetime | None = None


class TargetWeek(FlexibleModel):
    """Verified first kickoff; every transaction deadline derives from it."""

    week: int
    first_kickoff: AwareDatetime
    sales_deadline: AwareDatetime
    clauses_deadline: AwareDatetime
    protection_deadline: AwareDatetime


class TradeStep(FlexibleModel):
    """Conditional market-value estimate with balances after settlement."""

    action: Literal["sell", "buy"]
    player_id: str
    method: str
    estimate: int
    settlement_at: AwareDatetime
    cash_after: int
    squad_value_after: int
    squad_count_after: int
    debt_limit: int
    conditions: list[str]


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
