"""Best-first formation search with admissible bounds and truthful interruption."""

import heapq
import random
import time
from datetime import datetime
from decimal import Decimal
from itertools import count, cycle
from threading import Event

from fantasy_api.domain.lineup_builder.planning import plan_trades
from fantasy_api.schemas.lineup_builder import BuildPreferences, Candidate, ScoredPlayer, TargetWeek


def _upper_bound(
    buckets: tuple[tuple[ScoredPlayer, ...], ...],
    remaining: tuple[int, ...],
    offsets: tuple[int, ...],
    selected: tuple[ScoredPlayer, ...],
    score: Decimal,
    source: str,
) -> Decimal | None:
    """Bound the best completion containing the queue's required acquisition source."""
    upper = score
    penalties: list[Decimal] = []
    needs_source = source != "owned" and not any(p.source == source for p in selected)
    for bucket, amount, start in zip(buckets, remaining, offsets, strict=True):
        if not amount:
            continue
        choices = bucket[start : start + amount]
        if len(choices) < amount:
            return None
        upper += sum((p.lineup_score for p in choices), Decimal(0))
        if needs_source:
            if any(p.source == source for p in choices):
                penalties.append(Decimal(0))
            else:
                alternative = next((p for p in bucket[start:] if p.source == source), None)
                if alternative is not None:
                    penalties.append(alternative.lineup_score - choices[-1].lineup_score)
    if needs_source:
        return upper + max(penalties) if penalties else None
    return upper


def search_candidates(
    players: list[ScoredPlayer],
    owned: list[ScoredPlayer],
    cash: int,
    preferences: BuildPreferences,
    formations: list[str],
    target: TargetWeek,
    now: datetime,
    seed: int,
    *,
    reserved_squad_slots: int = 0,
    max_states: int = 100_000,
    max_seconds: float = 3.0,
    cancelled: Event | None = None,
) -> tuple[list[Candidate], bool, int]:
    """Explore all relevant choices without arbitrary positional pool truncation.

    Args:
        players: Eligible source-filtered player pool.
        owned: Whole current roster, including retained bench.
        cash: Verified current cash.
        preferences: Mandatory IDs, trade permissions and output limit.
        formations: Verified supported tactics.
        target: Target round deadlines.
        now: Snapshot instant.
        seed: Reproducible final tie-breaking seed.
        max_states: Bound on CPU work.
        max_seconds: Bound on elapsed search time.

    Returns:
        Ranked candidates, proof of search completeness and states evaluated.
    """
    mandatory = set(preferences.mandatory_player_ids)
    rng = random.Random(seed)
    results: list[Candidate] = []
    states = 0
    deadline = time.monotonic() + max_seconds
    serial = count()
    sources = ["owned"] + [
        source
        for source in ("market", "opponents")
        if preferences.allow_buying and any(p.source == source for p in players)
    ]
    lanes = {source: source for source in sources}
    lanes.update({f"{source}_comparison": source for source in sources[1:]})
    heaps = {lane: [] for lane in lanes}
    queue_results: dict[str, list[Candidate]] = {lane: [] for lane in lanes}
    turns = cycle(heaps)
    truncated = False
    salable = [
        p
        for p in owned
        if preferences.allow_selling
        and p.sections
        and p.sale_settlement_at is not None
        and now <= p.sale_settlement_at <= target.sales_deadline
    ]

    def financially_possible(selected: tuple[ScoredPlayer, ...]) -> bool:
        """Reject only partial selections that even optimistic sales cannot finance."""
        ids = {p.player_id for p in selected}
        available_sales = [p for p in salable if p.player_id not in ids]
        purchases = [p for p in selected if p.source != "owned"]
        return (
            sum(p.market_value for p in purchases)
            <= cash + sum(p.market_value for p in available_sales)
            and len(owned) + reserved_squad_slots + len(purchases) - len(available_sales) <= 24
        )

    for lane, group in lanes.items():
        heap = heaps[lane]
        pool = [p for p in players if group != "owned" or p.source == "owned"]
        if mandatory - {p.player_id for p in pool}:
            continue
        mandatory_players = tuple(p for p in pool if p.player_id in mandatory)
        required_sets = [mandatory_players]
        if lane != group:
            # Compare one source addition plus mandatory players against the owned squad.
            # These lanes share the budget with the unrestricted multi-purchase search.
            if not any(p.source == group for p in mandatory_players):
                required_sets = [
                    mandatory_players + (p,)
                    for p in pool
                    if p.source == group and p.player_id not in mandatory
                ]
            pool = [p for p in pool if p.source == "owned"]
        for required in required_sets:
            if not financially_possible(required):
                continue
            required_ids = {p.player_id for p in required}
            for formation in formations:
                counts = (1, *map(int, formation.split(",")))
                remaining = tuple(
                    counts[pos - 1] - sum(p.position == pos for p in required)
                    for pos in range(1, 5)
                )
                if min(remaining) < 0:
                    continue
                buckets = tuple(
                    tuple(
                        sorted(
                            (
                                p
                                for p in pool
                                if p.position == pos and p.player_id not in required_ids
                            ),
                            key=lambda p: (-p.lineup_score, p.player_id),
                        )
                    )
                    for pos in range(1, 5)
                )
                if any(len(bucket) < n for bucket, n in zip(buckets, remaining, strict=True)):
                    continue
                score = sum((p.lineup_score for p in required), Decimal(0))
                upper = _upper_bound(buckets, remaining, (0, 0, 0, 0), required, score, group)
                if upper is None:
                    continue
                heapq.heappush(
                    heap,
                    (
                        -upper,
                        sum(remaining),
                        next(serial),
                        group,
                        formation,
                        buckets,
                        remaining,
                        (0, 0, 0, 0),
                        required,
                        score,
                    ),
                )
    while (
        any(heaps.values())
        and states < max_states
        and time.monotonic() < deadline
        and (cancelled is None or not cancelled.is_set())
    ):
        lane = next(turns)
        if not heaps[lane]:
            continue
        heap = heaps[lane]
        neg_upper, _, _, group, formation, buckets, remaining, offsets, selected, score = (
            heapq.heappop(heap)
        )
        states += 1
        group_results = queue_results[lane]
        if len(group_results) >= preferences.max_candidates:
            threshold = sorted((r.total_lineup_score for r in group_results), reverse=True)[
                preferences.max_candidates - 1
            ]
            if -neg_upper < threshold:
                continue
        if not any(remaining):
            starters = list(selected)
            variants = [[]]
            if preferences.include_trading_purchases:
                extra_pool = sorted(
                    (
                        p
                        for p in players
                        if p.source != "owned"
                        and p.player_id not in {s.player_id for s in selected}
                    ),
                    key=lambda p: (-p.trading_score, p.player_id),
                )
                variants += [extra_pool[:n] for n in range(1, min(24, len(extra_pool)) + 1)]
            for extras in variants:
                plan = plan_trades(
                    starters, owned, cash, preferences, target, now, extras, reserved_squad_slots
                )
                if plan is not None:
                    candidate = Candidate(
                        candidate_id=str(next(serial)),
                        formation=formation,
                        resource_group="owned" if group == "owned" else "external",
                        starters=starters,
                        total_lineup_score=score,
                        tie_break=rng.random(),
                        trading_plan=plan,
                    )
                    results.append(candidate)
                    group_results.append(candidate)
            continue
        if sum(len(queue) for queue in heaps.values()) + states >= max_states:
            truncated = True
            break
        pos = next(i for i, n in enumerate(remaining) if n)
        bucket = buckets[pos]
        for index in range(offsets[pos], len(bucket) - remaining[pos] + 1):
            player = bucket[index]
            if not financially_possible(selected + (player,)):
                continue
            new_remaining = list(remaining)
            new_remaining[pos] -= 1
            new_offsets = list(offsets)
            new_offsets[pos] = index + 1
            new_score = score + player.lineup_score
            upper = _upper_bound(
                buckets,
                tuple(new_remaining),
                tuple(new_offsets),
                selected + (player,),
                new_score,
                group,
            )
            if upper is None:
                continue
            heapq.heappush(
                heap,
                (
                    -upper,
                    sum(new_remaining),
                    next(serial),
                    group,
                    formation,
                    buckets,
                    tuple(new_remaining),
                    tuple(new_offsets),
                    selected + (player,),
                    new_score,
                ),
            )
    results.sort(
        key=lambda r: (
            r.resource_group != "owned",
            -r.total_lineup_score,
            -r.trading_plan.projected_cash,
            -int(r.formation.split(",")[2]),
            r.tie_break,
        )
    )
    owned_results = [r for r in results if r.resource_group == "owned"]
    external_results: list[Candidate] = []
    seen = set()
    for result in results:
        if result.resource_group != "external":
            continue
        identity = (
            result.formation,
            frozenset(p.player_id for p in result.starters),
            frozenset(p.player_id for p in result.trading_plan.trading_purchases),
        )
        if identity not in seen:
            external_results.append(result)
            seen.add(identity)
    if owned_results:
        # Acquiring starters must improve on the strongest feasible owned XI.
        baseline = owned_results[0].total_lineup_score
        external_results = [r for r in external_results if r.total_lineup_score > baseline]
    # Reserve external comparisons without exceeding the caller's total result limit.
    external_slots = min(len(external_results), preferences.max_candidates // 2)
    owned_slots = min(len(owned_results), preferences.max_candidates - external_slots)
    budget = preferences.max_candidates - owned_slots
    # All enabled acquisition sources compete on workflow ranking, without source quotas.
    selected_results = owned_results[:owned_slots] + external_results[:budget]
    return selected_results, not any(heaps.values()) and not truncated, states
