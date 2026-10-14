"""Workflow scoring with source omissions and candidate-independent bounds."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from fantasy_api.domain.lineup_builder import policy
from fantasy_api.schemas.lineup_builder import Criterion, ScoredPlayer, SectionScore

WEIGHTS = tuple(map(Decimal, (".25", ".25", ".10", ".10", ".25", ".05")))
SECTIONS = ("basic", "indicators", "recent", "market", "fixtures", "injury")
ROLES = {"Dios": 4, "Clave": 3, "Importante": 2, "Rotación": 1, "Revulsivo": 0, "Reserva": -3}


class PlayerEvidence(BaseModel):
    """Validated facts from server adapters; no HTTP or credentials in scoring."""

    model_config = ConfigDict(frozen=True)
    availability_source: str = "futbolfantasy"
    status: Literal["available", "questionable", "recovering"]
    club_position: int | None = Field(default=None, ge=1, le=20)
    fantasy_average: Decimal | None = None
    risk: str | None = None
    probability: int | None = Field(default=None, ge=0, le=100)
    role: str | None = None
    form: str | None = None
    dazn_average: Decimal | None = None
    market_growth: Decimal
    protection_expiry: datetime | None = None
    club_results: tuple[str, ...] = ()
    midweek: bool = False
    midweek_minutes: int | None = None
    midweek_win: bool | None = None
    weather: str | None = None
    opponent_position: int | None = Field(default=None, ge=1, le=20)
    latest_injury: date | None = None
    history_complete: bool = False


def _normalized(raw: Decimal, lower: Decimal, upper: Decimal) -> Decimal:
    """Preserve zero; missing extrema never arise from observed player pools."""
    bound = upper if raw > 0 else abs(lower)
    return max(Decimal(-1), min(Decimal(1), raw / bound)) if raw and bound else Decimal(0)


def score_player(
    player: ScoredPlayer, facts: PlayerEvidence, now: datetime, kickoff: datetime
) -> ScoredPlayer:
    """Score six workflow sections and preserve every applied rule and omission.

    Args:
        player: Server-owned identity and trade route metadata.
        facts: Applicable facts, already checked for eligibility and provenance.
        now: Snapshot instant for protection expiry.
        kickoff: First kickoff of the target round.

    Returns:
        A new scored player, with exact Decimal axes and normalized trace.
    """
    sections: list[list[Criterion]] = [[] for _ in SECTIONS]
    omissions = list(player.omissions)

    def add(
        section: int,
        rule: str,
        value: int | None,
        lower: int,
        upper: int,
        observed: object,
        *,
        trading: bool = False,
        source: str = "futbolfantasy",
    ) -> None:
        """Add an applicable criterion or record an explicit omission."""
        if value is None:
            omissions.append(rule)
            return
        data = {
            "trading" if trading else "lineup": Decimal(value),
            "trading_lower" if trading else "lineup_lower": Decimal(lower),
            "trading_upper" if trading else "lineup_upper": Decimal(upper),
        }
        sections[section].append(
            Criterion(rule_id=rule, observed=str(observed), source=source, **data)
        )

    add(
        0,
        "club_position",
        policy.club_points(facts.club_position) if facts.club_position else None,
        -2,
        3,
        facts.club_position,
        source="standings",
    )
    add(
        0,
        "fantasy_average",
        (
            policy.fantasy_average(facts.fantasy_average)
            if facts.fantasy_average is not None
            else None
        ),
        -5,
        4,
        facts.fantasy_average,
    )
    add(
        0,
        "availability",
        -5 if facts.status == "questionable" else 0,
        -5 if facts.status == "questionable" else 0,
        0,
        facts.status,
        source=facts.availability_source,
    )
    add(
        1,
        "injury_risk",
        {"low": 1, "medium": 0, "high": -1, "unknown": 1}.get(facts.risk),
        -1,
        1,
        facts.risk,
    )
    # Role, probability and impact bonus share attainable outcomes.
    probability = facts.probability
    if probability is not None and facts.role in ROLES:
        outcomes = [
            role_points
            + policy.probability_points(p)
            + (2 if role == "Revulsivo" and p < 60 else 0)
            for role, role_points in ROLES.items()
            for p in range(101)
        ]
        points = ROLES[facts.role] + policy.probability_points(probability)
        points += 2 if facts.role == "Revulsivo" and probability < 60 else 0
        add(
            1,
            "role_and_starting_probability",
            points,
            min(outcomes),
            max(outcomes),
            f"{facts.role}: {probability}%",
        )
    else:
        add(
            1,
            "starting_probability",
            policy.probability_points(probability) if probability is not None else None,
            -5,
            4,
            probability,
        )
        add(1, "squad_role", ROLES.get(facts.role), -3, 4, facts.role)
    add(
        1,
        "form",
        {"bad": -2, "very_bad": -2, "mid": 0, "good": 2, "very_good": 2}.get(facts.form),
        -2,
        2,
        facts.form,
    )
    add(
        2,
        "dazn_average",
        policy.dazn_average(facts.dazn_average) if facts.dazn_average is not None else None,
        -2,
        3,
        facts.dazn_average,
    )
    growth = facts.market_growth
    penalty = policy.expensive_penalty(player.market_value)
    add(
        3,
        "market_growth_and_value",
        policy.market_change(growth) + (penalty if growth < Decimal(".01") else 0),
        -10 + penalty,
        10,
        growth,
        trading=True,
        source="fantasy_market_history",
    )
    advice = False
    expiry = facts.protection_expiry
    if player.source == "owned" and expiry is not None:
        hours = (kickoff - expiry).total_seconds() / 3600
        trading, lineup = (
            (-7, -3)
            if expiry <= now
            else (-5, -3) if hours >= 48 else (-3, 0) if expiry < kickoff else (3, 0)
        )
        advice = now < expiry < kickoff and hours < 48
        add(3, "owned_protection_lineup", lineup, -3, 0, expiry, source="fantasy_roster")
        add(
            3,
            "owned_protection_trading",
            trading,
            -7,
            3,
            expiry,
            trading=True,
            source="fantasy_roster",
        )
    elif player.source == "owned":
        omissions.append("owned_protection_unknown")
    if facts.club_results:
        add(
            4,
            "club_results",
            sum({"W": 3, "D": 1, "L": 0}[r] for r in facts.club_results),
            0,
            len(facts.club_results) * 3,
            facts.club_results,
            source="standings",
        )
    else:
        omissions.append("club_results")
    if facts.midweek:
        add(4, "midweek_congestion", -2, -2, 0, True)
        minutes = facts.midweek_minutes
        if minutes is not None:
            # Minutes bonus and rest are mutually exclusive; sum attainable combinations.
            can_rest = (
                facts.role in {"Dios", "Clave", "Importante"}
                and facts.status == "available"
                and probability is not None
            )
            result_known = facts.midweek_win is not None
            outcomes = []
            for m in range(121):
                regular = (1 + (3 if result_known else 0)) if 60 <= m <= 90 else 0
                rest = policy.rest_points(m, probability) if can_rest and 0 < m < 60 else 0
                outcomes.append(max(regular, rest))
            points = (1 + (3 if facts.midweek_win else 0)) if 60 <= minutes <= 90 else 0
            if can_rest and 0 < minutes < 60:
                points = policy.rest_points(minutes, probability)
            add(4, "midweek_minutes_and_rest", points, 0, max(outcomes), minutes)
        else:
            omissions.append("midweek_minutes_and_rest")
    weather = {
        "clear": 0,
        "few_clouds": 0,
        "scattered_clouds": 0,
        "broken_clouds": 0,
        "overcast": 0,
        "drizzle": -1,
        "rain": -1,
        "shower_rain": -1,
        "thunderstorm": -2,
        "snow": -1,
        "mist": -1,
    }
    add(4, "weather", weather.get(facts.weather), -2, 0, facts.weather, source="openweather")
    add(
        4,
        "opponent_position",
        policy.opponent_points(facts.opponent_position) if facts.opponent_position else None,
        -10,
        5,
        facts.opponent_position,
        source="standings",
    )
    if facts.status == "recovering":
        add(5, "injury_recovery", -3, -3, 0, facts.status)
    elif facts.latest_injury is not None:
        days = (kickoff.date() - facts.latest_injury).days
        add(5, "injury_history", policy.injury_points(max(0, days)), -5, 3, days)
    elif facts.history_complete:
        add(5, "injury_history", 3, -5, 3, "complete_empty")
    else:
        omissions.append("injury_history_unknown")
    active_weight = sum(
        (
            w
            for w, criteria in zip(WEIGHTS, sections, strict=True)
            if any(c.lineup is not None for c in criteria)
        ),
        Decimal(0),
    )
    scores = []
    for name, weight, criteria in zip(SECTIONS, WEIGHTS, sections, strict=True):
        raw_l = sum((c.lineup or Decimal(0) for c in criteria), Decimal(0))
        raw_t = sum((c.trading or Decimal(0) for c in criteria), Decimal(0))
        low_l = sum((c.lineup_lower for c in criteria), Decimal(0))
        high_l = sum((c.lineup_upper for c in criteria), Decimal(0))
        low_t = sum((c.trading_lower for c in criteria), Decimal(0))
        high_t = sum((c.trading_upper for c in criteria), Decimal(0))
        scores.append(
            SectionScore(
                section=name,
                criteria=criteria,
                lineup_raw=raw_l,
                trading_raw=raw_t,
                lineup_lower=low_l,
                lineup_upper=high_l,
                trading_lower=low_t,
                trading_upper=high_t,
                lineup_normalized=_normalized(raw_l, low_l, high_l),
                trading_normalized=_normalized(raw_t, low_t, high_t),
                effective_weight=(
                    weight / active_weight
                    if any(c.lineup is not None for c in criteria)
                    else Decimal(0)
                ),
            )
        )
    lineup = sum((s.lineup_normalized * s.effective_weight for s in scores), Decimal(0))
    trading = sum((s.trading_normalized for s in scores), Decimal(0))
    return player.model_copy(
        update={
            "sections": scores,
            "lineup_score": lineup,
            "trading_score": trading,
            "combined_score": lineup + trading,
            "omissions": omissions,
            "protection_advice": advice,
        }
    )
