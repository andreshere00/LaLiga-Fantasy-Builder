"""Boundary, oracle and whole-squad conformance for the read-only builder."""

# ---- Mocks, fixtures & helpers ---- #

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from itertools import combinations, product
from random import Random

import pytest
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.domain.lineup_builder import policy
from fantasy_api.domain.lineup_builder.formations import FormationSpec
from fantasy_api.domain.lineup_builder.planning import plan_trades
from fantasy_api.domain.lineup_builder.scoring import PlayerEvidence, score_player
from fantasy_api.domain.lineup_builder.search import _upper_bound, search_candidates
from fantasy_api.domain.lineup_builder.target import instant, resolve_target
from fantasy_api.schemas.calendar import CurrentWeek, Fixture
from fantasy_api.schemas.lineup_builder import (
    FREE_FORMATIONS,
    BuildPreferences,
    ScoredPlayer,
    TargetWeek,
)
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


def test_formation_spec_parses_slots_and_checks_required_players() -> None:
    formation = FormationSpec.parse("4,4,2")

    assert formation.capacities == (1, 4, 4, 2)
    assert formation.midfielders == 4
    assert formation.fits([player(1, 1), player(2, 2), player(3, 3), player(4, 4)])
    assert not formation.fits([player(number, 2) for number in range(5)])


@pytest.mark.parametrize("source", ["market", "opponents"])
@pytest.mark.parametrize("capacity", range(6))
def test_upper_bound_purchase_capacity_never_undercuts_exhaustive_completion(
    source: str, capacity: int
) -> None:
    for seed in range(12):
        rng = Random(seed)
        buckets = tuple(
            tuple(
                sorted(
                    (
                        player(
                            position * 10 + i,
                            position,
                            source=("owned", "owned", "market", "opponents")[i],
                            score=str(Decimal(rng.randrange(-10, 11)) / 10),
                        )
                        for i in range(4)
                        if seed % 3 != 0 or position != 1 or i >= 2
                    ),
                    key=lambda p: -p.lineup_score,
                )
            )
            for position in range(1, 5)
        )
        remaining = (1, 2, 1, 1)
        offsets = tuple(rng.randrange(2) for _ in buckets)
        selected = (player(99, 4, source=source if seed % 2 else "owned"),)
        score = selected[0].lineup_score
        oracle = [
            score + sum((p.lineup_score for row in rows for p in row), Decimal(0))
            for rows in product(
                *(
                    combinations(bucket[start:], amount)
                    for bucket, amount, start in zip(buckets, remaining, offsets, strict=True)
                )
            )
            if sum(p.source != "owned" for row in rows for p in row) <= capacity
            and any(p.source == source for p in selected + tuple(p for row in rows for p in row))
        ]
        bound = _upper_bound(buckets, remaining, offsets, selected, score, source, capacity)
        if oracle:
            assert bound is not None
            assert bound >= max(oracle)


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


@pytest.mark.parametrize("source", ["market", "opponents"])
def test_search_candidates_owned_alternatives_do_not_hide_external_group(source: str) -> None:
    owned = pool()
    external = player(99, 4, source=source, score="1")
    players = owned + [external]
    preferences = BuildPreferences(allow_buying=True, max_candidates=5)
    result, complete, _ = search_candidates(
        players, owned, 1000, preferences, ["4,4,2"], TARGET, NOW, 1, max_seconds=30
    )
    assert complete
    assert [candidate.resource_group for candidate in result] == [
        "owned",
        "owned",
        "owned",
        "external",
        "external",
    ]
    assert all(
        any(p.source == source for p in candidate.starters)
        for candidate in result
        if candidate.resource_group == "external"
    )
    choices = [
        combinations([p for p in players if p.position == position], amount)
        for position, amount in ((1, 1), (2, 4), (3, 4), (4, 2))
    ]
    external_scores = sorted(
        (
            sum((p.lineup_score for row in rows for p in row), Decimal(0))
            for rows in product(*choices)
            if any(p.source != "owned" for row in rows for p in row)
        ),
        reverse=True,
    )
    assert [
        c.total_lineup_score for c in result if c.resource_group == "external"
    ] == external_scores[:2]


def test_search_candidates_limited_budget_serves_both_resource_groups() -> None:
    owned = [p.model_copy(update={"lineup_score": Decimal(".5")}) for p in pool()]
    external = player(99, 1, source="market", score="1")
    result, complete, states = search_candidates(
        owned + [external],
        owned,
        1000,
        BuildPreferences(allow_buying=True),
        ["4,4,2"],
        TARGET,
        NOW,
        1,
        max_states=500,
        max_seconds=30,
    )
    assert not complete
    assert states <= 500
    assert {candidate.resource_group for candidate in result} == {"owned", "external"}


@pytest.mark.parametrize("position", [1, 4])
@pytest.mark.parametrize("include_opponent", [False, True])
def test_search_candidates_limited_budget_keeps_better_acquisitions_without_source_quotas(
    position: int, include_opponent: bool
) -> None:
    owned = [p.model_copy(update={"lineup_score": Decimal("1")}) for p in pool()]
    market = player(99, position, source="market", score=".1")
    opponent = player(199, 4, source="opponents", score="2")
    result, complete, states = search_candidates(
        owned + [market] + ([opponent] if include_opponent else []),
        owned,
        1000,
        BuildPreferences(allow_buying=True, max_candidates=5),
        ["4,4,2"],
        TARGET,
        NOW,
        1,
        max_states=500,
        max_seconds=30,
    )
    assert not complete
    assert states <= 500
    external = [c for c in result if c.resource_group == "external"]
    if include_opponent:
        assert len(external) == 2
        assert all(any(p.player_id == "199" for p in c.starters) for c in external)
        assert all(p.player_id != "99" for c in external for p in c.starters)
    else:
        assert not external
        assert len(result) == 5


@pytest.mark.parametrize("expensive_value", [200, 10_000])
def test_search_candidates_expensive_pool_does_not_starve_affordable_acquisition_comparisons(
    expensive_value: int,
) -> None:
    owned = pool()
    expensive = [
        player(
            1000 + i,
            1 + i % 4,
            source="market" if i % 2 else "opponents",
            value=expensive_value,
            score=".9",
        )
        for i in range(48)
    ]
    affordable = [
        player(9000, 4, source="market", value=100, score=".5"),
        player(9001, 4, source="opponents", value=100, score=".5"),
    ]
    result, complete, states = search_candidates(
        owned + expensive + affordable,
        owned,
        500,
        BuildPreferences(allow_buying=True),
        ["4,4,2", "3,4,3"],
        TARGET,
        NOW,
        1,
        reserved_squad_slots=3,
        max_states=1000,
        max_seconds=30,
    )
    assert not complete
    assert states <= 1000
    assert [c.resource_group for c in result] == ["owned"] * 3 + ["external"] * 2
    external = result[3:]
    assert all(c.trading_plan.acquisitions for c in external)
    # Both proposals beat or match the best single-addition 4-4-2, regardless of source.
    minimum_score = Decimal("3.3" if expensive_value == 200 else "2.9")
    assert all(c.total_lineup_score >= minimum_score for c in external)
    for candidate in result:
        assert candidate.trading_plan.projected_cash >= 0
        assert candidate.trading_plan.squad_count + 3 <= 24
        assert sum(p.market_value for p in candidate.trading_plan.acquisitions) <= 500


def test_search_candidates_sales_can_finance_external_comparisons() -> None:
    facts = PlayerEvidence(status="available", market_growth=Decimal(0))
    owned = [
        score_player(p, facts, NOW, START).model_copy(update={"sale_settlement_at": NOW})
        for p in pool()
    ]
    external = player(9000, 4, source="market", value=150)
    result, complete, _ = search_candidates(
        owned + [external],
        owned,
        0,
        BuildPreferences(allow_buying=True, allow_selling=True),
        ["4,4,2"],
        TARGET,
        NOW,
        1,
        max_seconds=30,
    )
    assert complete
    purchases = [c for c in result if c.resource_group == "external"]
    assert purchases
    assert all(c.trading_plan.sales and c.trading_plan.projected_cash >= 0 for c in purchases)
    for candidate in purchases:
        assert not {p.player_id for p in candidate.starters} & {
            p.player_id for p in candidate.trading_plan.sales
        }


@pytest.mark.parametrize("source", ["market", "opponents"])
@pytest.mark.parametrize("allow_selling", [False, True])
def test_search_candidates_budgeted_multi_player_upgrades_keep_cash_nonnegative(
    source: str, allow_selling: bool
) -> None:
    facts = PlayerEvidence(status="available", market_growth=Decimal(0))
    owned = [
        score_player(p, facts, NOW, START).model_copy(
            update={"sale_settlement_at": NOW, "lineup_score": p.lineup_score}
        )
        for p in pool()
    ]
    unaffordable = [
        player(1000 + i, 1 + i % 4, source=source, value=1000, score=".95") for i in range(48)
    ]
    upgrades = [
        player(9000 + i, position, source=source, value=250, score=".8")
        for i, position in enumerate((1, 3, 4))
    ]

    result, complete, states = search_candidates(
        owned + unaffordable + upgrades,
        owned,
        60,
        BuildPreferences(allow_buying=True, allow_selling=allow_selling, max_candidates=7),
        ["4,4,2"],
        TARGET,
        NOW,
        1,
        max_states=1000,
        max_seconds=30,
    )

    assert complete
    assert states <= 1000
    assert len(result) == 7
    external = [c for c in result if c.resource_group == "external"]
    if not allow_selling:
        assert not external
        return
    assert len(external) == 3
    assert external[0].total_lineup_score == Decimal("4.6")
    for candidate in external:
        plan = candidate.trading_plan
        assert {p.player_id for p in plan.acquisitions} == {p.player_id for p in upgrades}
        assert len(plan.sales) == 7
        assert plan.projected_cash == 10
        assert plan.squad_count == 12
        assert plan.squad_value == 1650
        assert not {p.player_id for p in plan.sales} & {p.player_id for p in candidate.starters}
        balance = 60
        for step in plan.steps:
            balance += step.estimate if step.action == "sell" else -step.estimate
            assert step.cash_after == balance
            assert balance >= 0
        assert balance == plan.projected_cash


@pytest.mark.parametrize("reserved_slots", [0, 3, 8])
def test_search_candidates_multi_player_upgrades_respect_available_squad_slots(
    reserved_slots: int,
) -> None:
    owned = pool()
    purchases = [
        player(1000 + i, 1 + i % 4, source="market" if i % 2 else "opponents", value=10, score=".9")
        for i in range(100)
    ]
    result, _, states = search_candidates(
        owned + purchases,
        owned,
        1000,
        BuildPreferences(allow_buying=True, max_candidates=7),
        ["4,4,2", "3,4,3"],
        TARGET,
        NOW,
        1,
        reserved_squad_slots=reserved_slots,
        max_states=1000,
        max_seconds=30,
    )
    assert states <= 1000
    assert len(result) == 7
    available_slots = 24 - len(owned) - reserved_slots
    external = [c for c in result if c.resource_group == "external"]
    assert bool(external) == (available_slots > 0)
    for candidate in external:
        plan = candidate.trading_plan
        assert len(plan.acquisitions) == available_slots
        assert not plan.sales
        assert plan.projected_cash == 1000 - 10 * available_slots
        assert plan.squad_count + reserved_slots == 24
        assert all(step.cash_after >= 0 for step in plan.steps)


@pytest.mark.parametrize("cash,allow_selling", [(1000, False), (50, True), (0, True)])
def test_search_candidates_financial_bounds_match_exhaustive_trade_plans(
    cash: int, allow_selling: bool
) -> None:
    facts = PlayerEvidence(status="available", market_growth=Decimal(0))
    owned = [
        score_player(p, facts, NOW, START).model_copy(
            update={"sale_settlement_at": NOW, "lineup_score": p.lineup_score}
        )
        for position, amount in ((1, 1), (2, 4), (3, 5), (4, 3))
        for p in [p for p in pool() if p.position == position][:amount]
    ]
    players = owned + [
        player(99, 4, source="market", value=250, score=".8"),
        player(199, 3, source="opponents", value=150, score=".9"),
    ]
    preferences = BuildPreferences(allow_buying=True, allow_selling=allow_selling, max_candidates=7)
    oracle = {"owned": [], "external": []}
    choices = [
        combinations([p for p in players if p.position == position], amount)
        for position, amount in ((1, 1), (2, 4), (3, 4), (4, 2))
    ]
    for rows in product(*choices):
        starters = [p for row in rows for p in row]
        plan = plan_trades(starters, owned, cash, preferences, TARGET, NOW, reserved_squad_slots=10)
        if plan is not None:
            group = "external" if plan.acquisitions else "owned"
            oracle[group].append(
                (sum((p.lineup_score for p in starters), Decimal(0)), plan.projected_cash)
            )
    for values in oracle.values():
        values.sort(reverse=True)
    if oracle["owned"]:
        oracle["external"] = [v for v in oracle["external"] if v[0] > oracle["owned"][0][0]]
    external_slots = min(len(oracle["external"]), 3)
    owned_slots = min(len(oracle["owned"]), 7 - external_slots)
    expected = oracle["owned"][:owned_slots] + oracle["external"][: 7 - owned_slots]

    result, complete, _ = search_candidates(
        players,
        owned,
        cash,
        preferences,
        ["4,4,2"],
        TARGET,
        NOW,
        1,
        reserved_squad_slots=10,
        max_seconds=30,
    )

    assert complete
    assert [(c.total_lineup_score, c.trading_plan.projected_cash) for c in result] == expected


@pytest.mark.parametrize("market_score,opponent_score", [(".15", "1"), ("1", ".15"), (".7", ".8")])
def test_search_candidates_acquisition_group_matches_exhaustive_oracle(
    market_score: str, opponent_score: str
) -> None:
    owned = pool()
    players = owned + [
        player(99, 4, source="market", score=market_score),
        player(199, 4, source="opponents", score=opponent_score),
    ]
    result, complete, _ = search_candidates(
        players,
        owned,
        1000,
        BuildPreferences(allow_buying=True),
        ["4,4,2"],
        TARGET,
        NOW,
        1,
        max_seconds=30,
    )
    choices = [
        combinations([p for p in players if p.position == position], amount)
        for position, amount in ((1, 1), (2, 4), (3, 4), (4, 2))
    ]
    all_lineups = [tuple(p for row in rows for p in row) for rows in product(*choices)]
    assert complete
    assert len(result) == 5
    expected = sorted(
        (
            sum((p.lineup_score for p in lineup), Decimal(0))
            for lineup in all_lineups
            if any(p.source != "owned" for p in lineup)
        ),
        reverse=True,
    )
    assert [c.total_lineup_score for c in result[3:]] == expected[:2]


@pytest.mark.parametrize("max_states", [1000, 100_000])
def test_search_candidates_bauza_does_not_displace_second_fer_nino_lineup(max_states: int) -> None:
    # Reproduce the reported squad using its displayed scores and two eligible acquisitions.
    roster = [
        (1, "Unai Simón", ".451"),
        (1, "A. Herrero", ".1"),
        (2, "Hancko", ".445"),
        (2, "Kike Salas", ".420"),
        (2, "Yoel Lago", ".399"),
        (2, "Yuri", ".320"),
        (2, "Vanja Drkusic", ".1"),
        (3, "Rodri", ".637"),
        (3, "C. Soler", ".515"),
        (3, "Valverde", ".468"),
        (3, "Barrios", ".242"),
        (4, "Ez Abde", ".573"),
        (4, "Gordon", ".474"),
        (4, "I. Akhomach", ".253"),
    ]
    owned = [
        player(i, position, score=score).model_copy(update={"name": name})
        for i, (position, name, score) in enumerate(roster)
    ]
    fer_nino = player(99, 4, source="opponents", score=".593")
    bauza = player(199, 3, source="market", score="-.608")
    result, _, states = search_candidates(
        owned + [fer_nino, bauza],
        owned,
        1000,
        BuildPreferences(allow_buying=True),
        list(FREE_FORMATIONS),
        TARGET,
        NOW,
        1,
        max_states=max_states,
        max_seconds=30,
    )
    assert states <= max_states
    assert [c.resource_group for c in result] == ["owned"] * 3 + ["external"] * 2
    assert [c.total_lineup_score for c in result] == list(
        map(Decimal, ["4.955", "4.944", "4.877", "5.295", "5.217"])
    )
    assert all(any(p.player_id == "99" for p in c.starters) for c in result[3:])
    assert all(p.player_id != "199" for c in result for p in c.starters)


def test_search_candidates_lineup_covering_both_sources_is_not_duplicated() -> None:
    owned = pool()
    required = [
        p
        for position, amount in ((1, 1), (2, 4), (3, 4))
        for p in [p for p in owned if p.position == position][:amount]
    ]
    required += [player(99, 4, source="market"), player(199, 4, source="opponents")]
    result, complete, _ = search_candidates(
        owned + required[-2:],
        owned,
        1000,
        BuildPreferences(allow_buying=True, mandatory_player_ids=[p.player_id for p in required]),
        ["4,4,2"],
        TARGET,
        NOW,
        1,
        max_seconds=30,
    )
    assert complete
    assert len(result) == 1
    assert {p.player_id for p in result[0].starters} == {p.player_id for p in required}


@pytest.mark.parametrize("limit", [1, 2, 3, 5, 7, 14])
def test_search_candidates_mixed_groups_respect_total_output_limit(limit: int) -> None:
    owned = pool()
    result, _, _ = search_candidates(
        owned + [player(99, 4, source="market", score="1")],
        owned,
        1000,
        BuildPreferences(allow_buying=True, max_candidates=limit),
        ["4,4,2"],
        TARGET,
        NOW,
        1,
        max_seconds=30,
    )
    assert len(result) == limit
    assert result[0].resource_group == "owned"
    assert any(c.resource_group == "external" for c in result) == (limit > 1)
    external_count = limit // 2
    owned_count = limit - external_count
    assert [c.resource_group for c in result] == ["owned"] * owned_count + [
        "external"
    ] * external_count
    assert all(c.total_lineup_score > result[0].total_lineup_score for c in result[owned_count:])


@pytest.mark.parametrize("source", ["market", "opponents"])
@pytest.mark.parametrize("score", ["-.608", ".19", ".2", ".2000001"])
def test_search_candidates_acquisitions_must_strictly_improve_best_owned_score(
    source: str, score: str
) -> None:
    owned = pool()
    acquisition = player(99, 4, source=source, score=score).model_copy(
        update={"trading_score": Decimal("100")}
    )
    result, complete, _ = search_candidates(
        owned + [acquisition],
        owned,
        1000,
        BuildPreferences(allow_buying=True),
        ["4,4,2"],
        TARGET,
        NOW,
        1,
        max_seconds=30,
    )
    assert complete
    assert len(result) == 5
    assert result[0].total_lineup_score == Decimal("2.6")
    external = [c for c in result if c.resource_group == "external"]
    if Decimal(score) > Decimal(".2"):
        assert external
        assert all(c.total_lineup_score > Decimal("2.6") for c in external)
    else:
        assert not external


def test_search_candidates_external_can_fill_position_missing_from_owned_squad() -> None:
    owned = [p for p in pool() if p.position != 1]
    goalkeeper = player(99, 1, source="market", score="-.5")
    result, complete, _ = search_candidates(
        owned + [goalkeeper],
        owned,
        1000,
        BuildPreferences(allow_buying=True),
        ["4,4,2"],
        TARGET,
        NOW,
        1,
        max_seconds=30,
    )
    assert complete
    assert result
    assert all(c.resource_group == "external" for c in result)
    assert all(any(p.player_id == "99" for p in c.starters) for c in result)


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


@pytest.mark.parametrize("early_source", ["market", "opponents"])
def test_plan_trades_reversed_score_and_settlement_order_returns_chronological_steps(
    early_source: str,
) -> None:
    owned = [player(i, pos) for i, pos in enumerate([1, 2, 2, 2, 2, 3, 3, 3, 3])]
    early = player(90, 4, source=early_source, score=".2")
    late = player(91, 4, source="market", score=".8").model_copy(
        update={"settlement_at": START - timedelta(hours=12)}
    )

    plan = plan_trades(
        owned + [early, late], owned, 1000, BuildPreferences(allow_buying=True), TARGET, NOW
    )

    assert plan is not None
    assert [step.player_id for step in plan.steps] == [early.player_id, late.player_id]
    assert [step.settlement_at for step in plan.steps] == [early.settlement_at, late.settlement_at]
    assert [step.cash_after for step in plan.steps] == [900, 800]
    assert plan.squad_count == 11
    assert plan.projected_cash == 800
    assert [p.player_id for p in plan.acquisitions] == [late.player_id, early.player_id]


def test_plan_trades_multiple_sales_follow_settlement_times_before_spending_proceeds() -> None:
    facts = PlayerEvidence(status="available", market_growth=Decimal(0))
    owned = [
        score_player(p, facts, NOW, START).model_copy(update={"sale_settlement_at": NOW})
        for p in pool()
    ]
    owned[1] = owned[1].model_copy(update={"sale_settlement_at": NOW + timedelta(days=2)})
    purchase = player(99, 4, source="market", value=150).model_copy(
        update={"settlement_at": NOW + timedelta(days=3)}
    )
    starters = owned[:1] + owned[2:6] + owned[7:11] + [purchase, owned[-1]]

    plan = plan_trades(
        starters, owned, 10, BuildPreferences(allow_buying=True, allow_selling=True), TARGET, NOW
    )

    assert plan is not None
    assert [p.player_id for p in plan.sales] == ["11", "24"]
    assert [step.player_id for step in plan.steps] == ["24", "11", "99"]
    assert [step.settlement_at for step in plan.steps] == sorted(
        step.settlement_at for step in plan.steps
    )
    assert [step.cash_after for step in plan.steps] == [110, 210, 60]
    assert plan.projected_cash == 60


@pytest.mark.parametrize("early_source", ["market", "opponents"])
def test_search_candidates_reversed_settlement_scores_returns_feasible_lineup(
    early_source: str,
) -> None:
    owned = [player(i, pos) for i, pos in enumerate([1, 2, 2, 2, 2, 3, 3, 3, 3])]
    early = player(90, 4, source=early_source, score=".2")
    late = player(91, 4, source="market", score=".8").model_copy(
        update={"settlement_at": START - timedelta(hours=12)}
    )

    results, complete, _ = search_candidates(
        owned + [early, late],
        owned,
        1000,
        BuildPreferences(allow_buying=True),
        ["4,4,2"],
        TARGET,
        NOW,
        1,
    )

    assert complete
    assert len(results) == 1
    assert {p.player_id for p in results[0].starters} == {
        p.player_id for p in owned + [early, late]
    }


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
