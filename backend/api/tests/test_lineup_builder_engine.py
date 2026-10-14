"""Boundary, oracle and whole-squad conformance for the read-only builder."""

# ---- Mocks, fixtures & helpers ---- #

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from itertools import combinations, product

import pytest
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.domain.lineup_builder import policy
from fantasy_api.domain.lineup_builder.planning import plan_trades
from fantasy_api.domain.lineup_builder.scoring import PlayerEvidence, score_player
from fantasy_api.domain.lineup_builder.search import search_candidates
from fantasy_api.domain.lineup_builder.target import instant, resolve_target
from fantasy_api.schemas.calendar import CurrentWeek, Fixture
from fantasy_api.schemas.lineup_builder import BuildPreferences, ScoredPlayer, TargetWeek
from pydantic import ValidationError

NOW = datetime(2026, 10, 14, 12, tzinfo=UTC)
START = NOW + timedelta(days=7)
TARGET = TargetWeek(
    week=10,
    first_kickoff=START,
    sales_deadline=START - timedelta(hours=24),
    clauses_deadline=START - timedelta(hours=24),
    protection_deadline=START - timedelta(hours=48),
)


def player(
    number: int, position: int, *, source: str = "owned", value: int = 100, score: str = ".5"
) -> ScoredPlayer:
    """Create distinct master/slot identities and exact ranking scores."""
    return ScoredPlayer(
        player_id=str(number),
        player_team_id=f"slot-{number}" if source == "owned" else None,
        name=f"Player {number}",
        club_id=1,
        position=position,
        source=source,
        market_value=value,
        lineup_score=Decimal(score),
        trading_score=Decimal(score),
        combined_score=Decimal(score) * 2,
        acquisition_method=(
            "bid" if source == "market" else "clause" if source == "opponents" else None
        ),
        settlement_at=NOW + timedelta(days=1) if source != "owned" else None,
    )


def pool() -> list[ScoredPlayer]:
    """Small complete positional pools suitable for independent exhaustive enumeration."""
    return [
        player(i * 10 + j, i, score=str(Decimal(j) / 10))
        for i, n in ((1, 2), (2, 5), (3, 5), (4, 4))
        for j in range(n)
    ]


# ---- Happy path ---- #


@pytest.mark.parametrize(
    "value,expected",
    [
        ("-1", -5),
        ("0", -5),
        ("1.4999", -5),
        ("1.5", -2),
        ("2", -2),
        ("2.4999", -2),
        ("2.5", -1),
        ("2.9999", -1),
        ("3", 0),
        ("3.9999", 0),
        ("4", 1),
        ("4.9999", 1),
        ("5", 2),
        ("7.5", 2),
        ("7.5001", 3),
        ("10", 3),
        ("10.0001", 4),
    ],
)
def test_fantasy_average_boundaries_matches_policy(value: str, expected: int) -> None:
    assert policy.fantasy_average(Decimal(value)) == expected


@pytest.mark.parametrize(
    "average,raw,normalized", [("1", -5, "-1"), ("3", 0, "0"), ("5", 2, ".5"), ("11", 4, "1")]
)
def test_score_player_revised_fantasy_average_updates_section_bounds(
    average: str, raw: int, normalized: str
) -> None:
    scored = score_player(
        player(1, 1),
        PlayerEvidence(
            status="available", market_growth=Decimal(0), fantasy_average=Decimal(average)
        ),
        NOW,
        START,
    )
    basic = scored.sections[0]
    assert basic.lineup_raw == raw
    assert basic.lineup_lower == -5
    assert basic.lineup_upper == 4
    assert basic.lineup_normalized == Decimal(normalized)
    assert basic.effective_weight == 1
    assert scored.lineup_score == Decimal(normalized)


@pytest.mark.parametrize(
    "value,expected",
    [
        (".10", 10),
        (".07", 7),
        (".05", 5),
        (".025", 3),
        (".0101", 1),
        (".01", -1),
        ("-.01", -1),
        ("-.0101", -3),
        ("-.025", -5),
        ("-.05", -5),
        ("-.0501", -7),
        ("-.07", -7),
        ("-.0701", -10),
    ],
)
def test_market_change_boundaries_matches_policy(value: str, expected: int) -> None:
    assert policy.market_change(Decimal(value)) == expected


@pytest.mark.parametrize(
    "value,expected",
    [
        (0, 0),
        (10_000_000, -1),
        (15_000_000, -2),
        (25_000_000, -3),
        (50_000_000, -4),
        (80_000_000, -5),
        (120_000_000, -8),
        (180_000_000, -8),
        (180_000_001, -10),
    ],
)
def test_expensive_penalty_boundaries_matches_policy(value: int, expected: int) -> None:
    assert policy.expensive_penalty(value) == expected


@pytest.mark.parametrize(
    "probability,expected",
    [
        (0, -5),
        (29, -5),
        (30, -3),
        (40, -1),
        (50, 0),
        (51, 1),
        (60, 1),
        (61, 2),
        (81, 3),
        (80, 2),
        (90, 3),
        (91, 4),
        (100, 4),
    ],
)
def test_probability_points_boundaries_matches_policy(probability: int, expected: int) -> None:
    assert policy.probability_points(probability) == expected


@pytest.mark.parametrize(
    "value,expected",
    [
        ("-.1", -2),
        ("0", -2),
        (".4999", -2),
        (".5", -1),
        (".9999", -1),
        ("1", 0),
        ("1.4999", 0),
        ("1.5", 1),
        ("1.9999", 1),
        ("2", 2),
        ("2.5", 2),
        ("2.5001", 3),
    ],
)
def test_dazn_average_boundaries_matches_policy(value: str, expected: int) -> None:
    assert policy.dazn_average(Decimal(value)) == expected


@pytest.mark.parametrize(
    "average,raw,normalized", [("0", -2, "-1"), (".5", -1, "-.5"), ("1", 0, "0"), ("3", 3, "1")]
)
def test_score_player_revised_dazn_bands_preserve_negative_and_zero_scores(
    average: str, raw: int, normalized: str
) -> None:
    scored = score_player(
        player(1, 1),
        PlayerEvidence(status="available", market_growth=Decimal(0), dazn_average=Decimal(average)),
        NOW,
        START,
    )
    recent = scored.sections[2]
    assert recent.lineup_raw == raw
    assert recent.lineup_lower == -2
    assert recent.lineup_upper == 3
    assert recent.lineup_normalized == Decimal(normalized)
    assert recent.effective_weight == Decimal(".1") / Decimal(".35")
    assert scored.lineup_score == recent.lineup_normalized * recent.effective_weight


@pytest.mark.parametrize("role,raw,upper", [(None, 4, 4), ("Dios", 8, 8), ("Clave", 7, 8)])
def test_score_player_revised_probability_maximum_uses_achievable_bounds(
    role: str | None, raw: int, upper: int
) -> None:
    scored = score_player(
        player(1, 1),
        PlayerEvidence(status="available", market_growth=Decimal(0), probability=100, role=role),
        NOW,
        START,
    )
    indicators = scored.sections[1]
    assert indicators.lineup_raw == raw
    assert indicators.lineup_upper == upper
    assert indicators.lineup_normalized == Decimal(raw) / upper
    assert scored.lineup_score == indicators.lineup_normalized / 2


@pytest.mark.parametrize(
    "days,expected", [(0, -5), (1, -5), (3, -3), (5, -2), (7, -1), (10, 0), (14, 1), (30, 3)]
)
def test_injury_points_boundaries_matches_policy(days: int, expected: int) -> None:
    assert policy.injury_points(days) == expected


@pytest.mark.parametrize("position", range(1, 21))
def test_position_points_bands_are_bounded(position: int) -> None:
    assert -2 <= policy.club_points(position) <= 3
    assert -10 <= policy.opponent_points(position) <= 5


def test_score_player_missing_sections_redistributes_known_zero() -> None:
    scored = score_player(
        player(1, 1), PlayerEvidence(status="available", market_growth=Decimal(0)), NOW, START
    )
    assert scored.lineup_score == 0
    assert scored.sections[0].effective_weight == 1
    assert "injury_history_unknown" in scored.omissions
    assert scored.sections[3].effective_weight == 0
    assert scored.trading_score < 0


@pytest.mark.parametrize("minutes", [0, 15, 35, 50, 60, 90, 100])
def test_score_player_dependent_midweek_bounds_are_achievable(minutes: int) -> None:
    facts = PlayerEvidence(
        status="available",
        market_growth=Decimal(".02"),
        role="Clave",
        probability=50,
        midweek=True,
        midweek_minutes=minutes,
        midweek_win=True,
    )
    scored = score_player(player(1, 1), facts, NOW, START)
    section = scored.sections[4]
    family = next(c for c in section.criteria if c.rule_id == "midweek_minutes_and_rest")
    assert family.lineup_upper == 4
    assert 0 <= family.lineup <= 4
    assert family.lineup == (
        4 if 60 <= minutes <= 90 else policy.rest_points(minutes, 50) if 0 < minutes < 60 else 0
    )
    assert policy.rest_points(50, 50) == 1


@pytest.mark.parametrize(
    "hours,trading,lineup", [(-1, 3, 0), (24, -3, 0), (48, -5, -3), (200, -7, -3)]
)
def test_score_player_protection_boundaries_scores_once(
    hours: int, trading: int, lineup: int
) -> None:
    scored = score_player(
        player(1, 1),
        PlayerEvidence(
            status="questionable",
            market_growth=Decimal(0),
            protection_expiry=START - timedelta(hours=hours),
        ),
        NOW,
        START,
    )
    rules = {c.rule_id: c for s in scored.sections for c in s.criteria}
    assert rules["owned_protection_trading"].trading == trading
    assert rules["owned_protection_lineup"].lineup == lineup


def test_search_candidates_small_pool_matches_exhaustive_oracle() -> None:
    players = pool()
    prefs = BuildPreferences(formations=["4,4,2"], mandatory_player_ids=["20"], max_candidates=5)
    result, complete, _ = search_candidates(
        players, players, 1000, prefs, prefs.formations, TARGET, NOW, 123, max_seconds=30
    )
    choices = [
        list(combinations([p for p in players if p.position == pos], n))
        for pos, n in ((1, 1), (2, 4), (3, 4), (4, 2))
    ]
    oracle = sorted(
        (
            sum((p.lineup_score for row in rows for p in row), Decimal(0))
            for rows in product(*choices)
            if "20" in {p.player_id for row in rows for p in row}
        ),
        reverse=True,
    )
    assert complete
    assert [r.total_lineup_score for r in result] == oracle[:5]
    assert all("20" in {p.player_id for p in r.starters} for r in result)
    assert (
        search_candidates(
            players, players, 1000, prefs, prefs.formations, TARGET, NOW, 123, max_seconds=30
        )[0]
        == result
    )


def test_plan_trades_retained_bench_and_sales_accounted_at_every_stage() -> None:
    owned = pool()
    facts = PlayerEvidence(status="available", market_growth=Decimal(0))
    owned = [
        score_player(p, facts, NOW, START).model_copy(update={"sale_settlement_at": NOW})
        for p in owned
    ]
    starters = (
        owned[:1]
        + owned[2:6]
        + owned[7:11]
        + [player(99, 4, source="market", value=150), owned[-1]]
    )
    plan = plan_trades(
        starters, owned, 10, BuildPreferences(allow_buying=True, allow_selling=True), TARGET, NOW
    )
    assert plan is not None
    assert len(plan.sales) == 2
    assert plan.projected_cash == 60
    assert plan.squad_count == len(owned) - 1
    assert plan.squad_value == sum(p.market_value for p in owned) - 50
    assert all(s.cash_after >= -s.debt_limit for s in plan.steps)
    assert not {p.player_id for p in plan.sales} & {p.player_id for p in starters}


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "body",
    [
        {"user_id": "x"},
        {"sources": []},
        {"sources": ["owned", "owned"]},
        {"mandatory_player_ids": ["1", "1"]},
        {"mandatory_player_ids": [""]},
        {"formations": ["bad"]},
        {"include_trading_purchases": True},
        {"explanation": {"reasoning_effort": "low"}},
    ],
)
def test_build_preferences_invalid_body_rejects_before_work(body: dict) -> None:
    with pytest.raises(ValidationError):
        BuildPreferences.model_validate(body)


def test_search_candidates_budget_exhausted_does_not_prove_infeasibility() -> None:
    players = pool()
    assert search_candidates(
        players, players, 0, BuildPreferences(), ["4,4,2"], TARGET, NOW, 1, max_states=0
    ) == ([], False, 0)


@pytest.mark.parametrize("source", ["market", "opponents"])
def test_plan_trades_missing_routes_or_buying_permission_rejects(source: str) -> None:
    external = player(99, 4, source=source, value=500)
    assert plan_trades([external], pool(), 0, BuildPreferences(), TARGET, NOW) is None
    assert (
        plan_trades([external], pool(), 0, BuildPreferences(allow_buying=True), TARGET, NOW) is None
    )


def test_resolve_target_conflicting_opening_fails_closed() -> None:
    current = CurrentWeek(week_number=10, opening_week_date=NOW.isoformat())
    with pytest.raises(UpstreamError, match="opening"):
        resolve_target(current, {10: [Fixture(match_date=START.isoformat(), match_state=1)]}, NOW)


# ---- Edge cases ---- #


@pytest.mark.parametrize("raw", [None, "invalid", "2026-10-14"])
def test_instant_undated_or_naive_returns_unknown(raw: str | None) -> None:
    assert instant(raw) is None


def test_resolve_target_exact_kickoff_skips_started_round() -> None:
    result = resolve_target(
        CurrentWeek(week_number=10),
        {
            10: [Fixture(match_date=NOW.isoformat(), match_state=1)],
            11: [Fixture(match_date=START.isoformat(), match_state=1)],
        },
        NOW,
    )
    assert result.week == 11


@pytest.mark.parametrize("status", ["available", "questionable", "recovering"])
def test_score_player_complete_facts_preserves_axis_bounds(status: str) -> None:
    facts = PlayerEvidence(
        status=status,
        club_position=2,
        fantasy_average=Decimal(8),
        risk="low",
        probability=59,
        role="Revulsivo",
        form="very_bad",
        dazn_average=Decimal(3),
        market_growth=Decimal(".1"),
        club_results=("W", "D", "L"),
        weather="rain",
        opponent_position=1,
        history_complete=True,
    )
    scored = score_player(player(1, 1), facts, NOW, START)
    assert -1 <= scored.lineup_score <= 1
    assert sum(s.effective_weight for s in scored.sections) == 1
    assert all(-1 <= s.lineup_normalized <= 1 for s in scored.sections)


def test_plan_trades_pending_bid_slots_cannot_exceed_squad_cap() -> None:
    owned = pool() + [player(1000 + i, 1) for i in range(8)]
    assert len(owned) == 24
    starters = owned[:1] + owned[2:6] + owned[7:11] + owned[12:14]
    assert (
        plan_trades(starters, owned, 1000, BuildPreferences(), TARGET, NOW, reserved_squad_slots=1)
        is None
    )
    result = plan_trades(
        starters, owned[:-1], 1000, BuildPreferences(), TARGET, NOW, reserved_squad_slots=1
    )
    assert result is not None
    assert result.squad_count + result.reserved_squad_slots == 24
