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
    heaps = {source: [] for source in sources}
    queue_results: dict[str, list[Candidate]] = {source: [] for source in sources}
    turns = cycle(heaps)
    truncated = False
    for group in sources:
        heap = heaps[group]
        pool = [p for p in players if group != "owned" or p.source == "owned"]
        if mandatory - {p.player_id for p in pool}:
            continue
        for formation in formations:
            counts = (1, *map(int, formation.split(",")))
            required = tuple(p for p in pool if p.player_id in mandatory)
            remaining = tuple(
                counts[pos - 1] - sum(p.position == pos for p in required) for pos in range(1, 5)
            )
            if min(remaining) < 0:
                continue
            buckets = tuple(
                tuple(
                    sorted(
                        (p for p in pool if p.position == pos and p.player_id not in mandatory),
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
        group = next(turns)
        if not heaps[group]:
            continue
        heap = heaps[group]
        neg_upper, _, _, group, formation, buckets, remaining, offsets, selected, score = (
            heapq.heappop(heap)
        )
        states += 1
        group_results = queue_results[group]
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
    # Reserve external comparisons without exceeding the caller's total result limit.
    external_slots = min(len(external_results), preferences.max_candidates // 2)
    owned_slots = min(len(owned_results), preferences.max_candidates - external_slots)
    budget = preferences.max_candidates - owned_slots
    comparisons = external_results[:1] if budget else []
    for source in sources[1:]:
        if len(comparisons) >= budget:
            break
        if any(any(p.source == source for p in c.starters) for c in comparisons):
            continue
        candidate = next(
            (c for c in external_results if any(p.source == source for p in c.starters)), None
        )
        if candidate is not None:
            comparisons.append(candidate)
    for candidate in external_results:
        if len(comparisons) >= budget:
            break
        if candidate not in comparisons:
            comparisons.append(candidate)
    order = {candidate.candidate_id: index for index, candidate in enumerate(external_results)}
    comparisons.sort(key=lambda c: order[c.candidate_id])
    selected_results = owned_results[:owned_slots] + comparisons
    return selected_results, not any(heaps.values()) and not truncated, states
