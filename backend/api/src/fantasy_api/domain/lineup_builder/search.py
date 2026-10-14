"""Best-first formation search with admissible bounds and truthful interruption."""

import heapq
import random
import time
from datetime import datetime
from decimal import Decimal
from itertools import count
from threading import Event

from fantasy_api.domain.lineup_builder.planning import plan_trades
from fantasy_api.schemas.lineup_builder import BuildPreferences, Candidate, ScoredPlayer, TargetWeek


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
    heap = []
    truncated = False
    for group in ("owned", "external"):
        pool = [p for p in players if group == "external" or p.source == "owned"]
        if group == "external" and (
            not preferences.allow_buying or not any(p.source != "owned" for p in pool)
        ):
            continue
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
            upper = score + sum(
                (
                    sum((p.lineup_score for p in bucket[:n]), Decimal(0))
                    for bucket, n in zip(buckets, remaining, strict=True)
                ),
                Decimal(0),
            )
            heapq.heappush(
                heap,
                (
                    group == "external",
                    -upper,
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
        heap
        and states < max_states
        and time.monotonic() < deadline
        and (cancelled is None or not cancelled.is_set())
    ):
        _, neg_upper, _, group, formation, buckets, remaining, offsets, selected, score = (
            heapq.heappop(heap)
        )
        states += 1
        group_results = [r for r in results if r.resource_group == group]
        if len(group_results) >= preferences.max_candidates:
            threshold = sorted((r.total_lineup_score for r in group_results), reverse=True)[
                preferences.max_candidates - 1
            ]
            if -neg_upper < threshold:
                continue
        if not any(remaining):
            if group == "external" and all(p.source == "owned" for p in selected):
                continue
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
                    results.append(
                        Candidate(
                            candidate_id=str(next(serial)),
                            formation=formation,
                            resource_group=group,
                            starters=starters,
                            total_lineup_score=score,
                            tie_break=rng.random(),
                            trading_plan=plan,
                        )
                    )
            continue
        if len(heap) + states >= max_states:
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
            upper = new_score
            for b, n, start in zip(buckets, new_remaining, new_offsets, strict=True):
                upper += sum((p.lineup_score for p in b[start : start + n]), Decimal(0))
            heapq.heappush(
                heap,
                (
                    group == "external",
                    -upper,
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
    return results[: preferences.max_candidates], not heap and not truncated, states
