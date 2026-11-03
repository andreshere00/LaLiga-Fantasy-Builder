"""Weekly radar orchestration; independent of CLI parsing and provider construction."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fantasy_api.radar.audits import SupplyAudits
from fantasy_api.radar.catalog import CatalogInventory, build_inventory
from fantasy_api.radar.discovery import DiscoveryManifest, discovery_report, weekly_slot
from fantasy_api.radar.eligibility import RadarEligibility, filter_publication
from fantasy_api.radar.files import atomic_json, read_json
from fantasy_api.radar.registry import IdentityRegistry
from fantasy_api.radar.releases import publish_release, publisher_lock
from fantasy_api.services.radar_sync import IngestionTask, compile_dataset, plan_tasks


@dataclass(frozen=True)
class WeeklyOptions:
    """Paths, scope and freshness policy for one weekly attempt."""

    work_dir: Path
    root: Path
    registry: Path
    audits: Path
    captures: Path
    observations: Path
    eligibility: Path | None
    team_id: list[str]
    weekday: str
    check: bool
    stale_days: int
    maximum_days: int


async def run_weekly(
    args: WeeklyOptions,
    *,
    catalog_loader: Callable[[], Awaitable[Any]],
    fetcher: Callable[[list[IngestionTask]], Awaitable[dict[str, int]]],
) -> dict:
    """Claim the weekly slot before acquiring or publishing any observations."""
    if args.stale_days >= args.maximum_days:
        raise ValueError("stale threshold must precede maximum age")
    week, allowed = weekly_slot(args.weekday)
    state_path = args.work_dir / "weekly-attempt.json"
    with publisher_lock(args.work_dir / "weekly-lock"):
        state = read_json(state_path) if state_path.exists() else {}
        due = allowed and state.get("week") != week
        if args.check or not due:
            return {"due": due, "week": week, "weekday": args.weekday, "previous": state}
        # Claim before network access: even a failed run cannot cause repeated weekly downloads.
        atomic_json(
            state_path, {"week": week, "status": "started", "team_ids": sorted(set(args.team_id))}
        )
        previous = CatalogInventory.model_validate(read_json(args.work_dir / "catalog.json"))
        payload = await catalog_loader()
        catalog = build_inventory(
            payload,
            previous.season,
            previous,
            minimum_count=max(1, len(previous.players) * 9 // 10),
        )
        atomic_json(args.work_dir / "catalog.json", catalog.model_dump(mode="json"))
        registry = IdentityRegistry.model_validate(read_json(args.registry))
        audits = SupplyAudits.model_validate(read_json(args.audits))
        discovery = discovery_report(
            catalog,
            registry,
            DiscoveryManifest.model_validate(read_json(args.observations)),
            set(args.team_id),
        )
        atomic_json(args.work_dir / "discovery.json", discovery)
        tasks = plan_tasks(catalog, registry, audits, args.captures)
        scoped_ids = {p.player_id for p in catalog.players if p.team_id in args.team_id}
        policy = None
        if args.eligibility:
            policy = RadarEligibility.model_validate(read_json(args.eligibility))
            active_ids = [
                str(p["id"])
                for p in payload
                if str(p.get("positionId")) != "5"
                and p.get("playerStatus") != "out_of_league"
                and str(p.get("teamId")) in policy.clubs
            ]
            policy = RadarEligibility.model_validate(
                policy.model_dump() | {"active_player_ids": active_ids}
            )
            scoped_ids &= set(active_ids)
        counts = await fetcher([t for t in tasks if t.identity.player_id in scoped_ids])
        dataset = compile_dataset(
            catalog,
            registry,
            tasks,
            args.work_dir,
            stale_days=args.stale_days,
            maximum_days=args.maximum_days,
        )
        if policy is not None:
            dataset = filter_publication(dataset, policy)
        release = publish_release(args.root, dataset)
        failed = _fetch_failed(counts)
        result = {
            "week": week,
            "status": "partial" if failed else "complete",
            "release_id": release,
            "fetch": counts,
            "accounted": discovery["accounted"],
        }
        atomic_json(state_path, result)
        if failed:
            raise ValueError("weekly source refresh incomplete; inspect checkpoints")
        return result


def _fetch_failed(counts: dict[str, int]) -> bool:
    """Use the same incomplete-acquisition status for standalone and weekly jobs."""
    return any(
        counts.get(key)
        for key in (
            "source_invalid",
            "source_unavailable",
            "quarantined",
            "missing_import",
            "cached_stale",
        )
    )
