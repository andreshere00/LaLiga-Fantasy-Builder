"""Approved task planning, resumable source acquisition and local dataset compilation."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict

from fantasy_api.clients.scraping import ScrapingClient
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.radar.audits import RoleAssignment, SupplyAudit, SupplyAudits
from fantasy_api.radar.catalog import CatalogInventory, inventory_report
from fantasy_api.radar.coverage import RadarCoverage
from fantasy_api.radar.files import atomic_json, content_id, read_json
from fantasy_api.radar.profiles import PROFILES
from fantasy_api.radar.registry import IdentityDecision, IdentityRegistry
from fantasy_api.radar.releases import PublishedDataset, publisher_lock
from fantasy_api.schemas.player_radar import DataMBPlayer, RadarSnapshot, RadarStore
from fantasy_api.services.player_radar import build_radar


class IngestionTask(BaseModel):
    """A pinned identity, role and audited seven-column recipe."""

    model_config = ConfigDict(extra="forbid")
    identity: IdentityDecision
    role: RoleAssignment
    audit: SupplyAudit

    @property
    def key(self) -> str:
        """Bind checkpoints to reviewed inputs, including decision and audit versions."""
        return content_id(self.model_dump(mode="json"))


def plan_tasks(
    catalog: CatalogInventory,
    registry: IdentityRegistry,
    audits: SupplyAudits,
    captures: Path,
) -> list[IngestionTask]:
    """Plan offline; pending identities or roles never authorize source access."""
    audits.report(captures)
    indexed = {row.audit_id: row for row in audits.audits}
    current = registry.current()
    tasks = []
    fantasy_positions = {"Goalkeeper": 1, "Defense": 2, "Midfielder": 3, "Attacker": 4}
    for player in catalog.players:
        identity = current.get((player.player_id, catalog.season))
        if identity is None or identity.status != "matched":
            continue
        for role in identity.roles:
            audit = indexed.get(role.audit_id)
            if audit is None or (audit.provider, audit.profile, audit.season) != (
                identity.provider,
                role.profile,
                catalog.season,
            ):
                raise ValueError("role has no matching approved source audit")
            expected = fantasy_positions[PROFILES[role.profile].position]
            if player.position_id != expected and not role.position_override_reason:
                raise ValueError("Fantasy/source role conflict needs reviewed explanation")
            if identity.provider == "datamb":
                key = role.source_key or identity.source_key
                url = f"https://datamb.football/{key}/"
                if url != role.evidence and url not in identity.evidence:
                    raise ValueError("role's observed source key lacks identity evidence")
            tasks.append(IngestionTask(identity=identity, role=role, audit=audit))
    owners = {}
    for task in tasks:
        source = (
            task.identity.provider,
            task.role.source_key or task.identity.source_key,
            task.identity.season,
            task.role.profile,
        )
        owner = owners.setdefault(source, task.identity.player_id)
        if owner != task.identity.player_id:
            raise ValueError("source role assigned to multiple Fantasy identities")
    return tasks


def semantic_snapshot_id(snapshot: RadarSnapshot) -> str:
    """Exclude retrieval timestamps and operational flags from statistical content IDs."""
    return content_id(
        snapshot.model_dump(
            mode="json",
            exclude={
                "snapshot_id",
                "fetched_at",
                "stale",
                "warnings",
            },
        )
    )


def _source_snapshot(task: IngestionTask, payload: Any) -> RadarSnapshot:
    """Validate private adapter shape and identity before mapping seven audited columns."""
    row = DataMBPlayer.model_validate(payload)
    audit, identity = task.audit, task.identity
    if (
        row.name != identity.expected_name
        or row.position != audit.source_position
        or row.season != identity.season
        or row.metric_labels != audit.source_labels
    ):
        raise ValueError("source identity, role, season or columns changed")
    snapshot = RadarSnapshot(
        player_id=identity.player_id,
        player=row.name,
        club=row.club,
        age=row.age,
        season=row.season,
        competition=row.league,
        period="league season",
        minutes=row.minutes,
        profile=task.role.profile,
        source="datamb",
        method="provider_native_percentile",
        recipe_version=audit.recipe_version,
        snapshot_id="pending",
        fetched_at=row.fetched_at,
        cohort=task.role.cohort,
        stale=row.stale,
        source_metrics=dict(zip(audit.metric_keys, audit.source_labels, strict=True)),
        percentiles=dict(zip(audit.metric_keys, row.percentiles, strict=True)),
    )
    return snapshot.model_copy(update={"snapshot_id": semantic_snapshot_id(snapshot)})


def _checked_import(task: IngestionTask, snapshot: RadarSnapshot) -> RadarSnapshot:
    """Apply the same reviewed identity and semantic contract to authorized imports."""
    if (
        snapshot.player_id != task.identity.player_id
        or snapshot.player != task.identity.expected_name
        or snapshot.profile != task.role.profile
        or snapshot.season != task.identity.season
        or snapshot.source != "imported"
        or task.identity.provider != "imported"
        or snapshot.recipe_version != task.audit.recipe_version
        or [snapshot.source_metrics.get(k) for k in task.audit.metric_keys]
        != task.audit.source_labels
        or snapshot.cohort != task.role.cohort
    ):
        raise ValueError("import differs from approved identity, role, recipe or cohort")
    return snapshot.model_copy(update={"snapshot_id": semantic_snapshot_id(snapshot)})


async def fetch_tasks(
    tasks: list[IngestionTask],
    work_dir: Path,
    scraper: ScrapingClient,
    *,
    imports: RadarStore | None = None,
    refresh_days: int = 7,
    now: datetime | None = None,
) -> dict[str, int]:
    """Checkpoint each bounded sequential attempt; retain valid data on transient errors.

    No retry loop: adapter policies own request limits. On provider blocking or
    availability failure, stop the batch. Re-running resumes completed tasks.
    Schema/identity failures are quarantined until the reviewed task changes.
    """
    current = now or datetime.now(UTC)
    counts: Counter[str] = Counter()
    imported = {(s.player_id, s.season, s.profile): s for s in (imports or RadarStore()).snapshots}
    if imports and imports.datamb_mappings:
        raise ValueError("imports must contain observations, not live mappings")
    approved = {(t.identity.player_id, t.identity.season, t.role.profile) for t in tasks}
    if imported.keys() - approved:
        raise ValueError("import includes unapproved identities or roles")
    with publisher_lock(work_dir):
        for task in tasks:
            path = work_dir / "checkpoints" / f"{task.key}.json"
            old = read_json(path) if path.exists() else {}
            if old.get("task_hash") not in (None, task.key):
                raise ValueError("checkpoint task mismatch")
            snapshot = (
                RadarSnapshot.model_validate(old["snapshot"]) if old.get("snapshot") else None
            )
            if old.get("error_code") == "source_invalid":
                counts["quarantined"] += 1
                continue
            if (
                snapshot
                and current - snapshot.fetched_at < timedelta(days=refresh_days)
                and not snapshot.stale
            ):
                counts["skipped_fresh"] += 1
                continue
            error = None
            stop = False
            try:
                if task.identity.provider == "imported":
                    source = imported.get(
                        (task.identity.player_id, task.identity.season, task.role.profile)
                    )
                    if source is None:
                        counts["missing_import"] += 1
                        continue
                    snapshot = _checked_import(task, source)
                else:
                    payload = await scraper.get_json(
                        "/internal/radar/datamb",
                        {
                            "profile_key": task.role.source_key or task.identity.source_key or "",
                            "season": task.identity.season,
                        },
                    )
                    snapshot = _source_snapshot(task, payload)
                error = "cached_stale" if snapshot.stale else None
                counts["success"] += 1
            except UpstreamError as exc:
                error = "source_unavailable"
                counts["source_unavailable"] += 1
                # A missing page does not establish missing minutes or missing season.
                if exc.provider_status in (403, 429):
                    counts[str(exc.provider_status)] += 1
                stop = True
            except ValueError:
                error = "source_invalid"
                counts["source_invalid"] += 1
            atomic_json(
                path,
                {
                    "task_hash": task.key,
                    "last_attempt_at": current.isoformat(),
                    "error_code": error,
                    "snapshot": snapshot.model_dump(mode="json") if snapshot else None,
                },
            )
            if stop:
                counts["batch_stopped"] += 1
                break
    return dict(counts)


def compile_dataset(
    catalog: CatalogInventory,
    registry: IdentityRegistry,
    tasks: list[IngestionTask],
    work_dir: Path,
    *,
    now: datetime | None = None,
    stale_days: int = 8,
    maximum_days: int = 30,
) -> PublishedDataset:
    """Build complete coverage and stable candidate index from approved checkpoints only."""
    current = now or datetime.now(UTC)
    by_player: dict[str, list[tuple[IngestionTask, dict[str, Any], RadarSnapshot | None]]] = {}
    snapshots = []
    for task in tasks:
        path = work_dir / "checkpoints" / f"{task.key}.json"
        checkpoint = read_json(path) if path.exists() else {}
        if checkpoint.get("task_hash") not in (None, task.key):
            raise ValueError("checkpoint task mismatch")
        snapshot = (
            RadarSnapshot.model_validate(checkpoint["snapshot"])
            if checkpoint.get("snapshot")
            else None
        )
        if snapshot:
            # Revalidate saved observations at publication, not only on download.
            if task.identity.provider == "imported":
                snapshot = _checked_import(task, snapshot)
            elif (
                snapshot.source != "datamb"
                or snapshot.method != "provider_native_percentile"
                or snapshot.player_id != task.identity.player_id
                or snapshot.player != task.identity.expected_name
                or snapshot.profile != task.role.profile
                or snapshot.season != catalog.season
                or snapshot.recipe_version != task.audit.recipe_version
                or snapshot.cohort != task.role.cohort
                or [snapshot.source_metrics.get(k) for k in task.audit.metric_keys]
                != task.audit.source_labels
            ):
                raise ValueError("checkpoint no longer matches its approved task")
            age = current - snapshot.fetched_at
            if age < timedelta(minutes=-5):
                raise ValueError("future snapshot retrieval time")
            if age > timedelta(days=maximum_days):
                checkpoint = checkpoint | {"expired": True}
                snapshot = None
            else:
                snapshot = snapshot.model_copy(
                    update={
                        "stale": snapshot.stale
                        or bool(checkpoint.get("error_code"))
                        or age > timedelta(days=stale_days)
                    }
                )
                snapshots.append(snapshot)
        by_player.setdefault(task.identity.player_id, []).append((task, checkpoint, snapshot))
    dataset_id = content_id(
        {
            "catalog": catalog.snapshot_id,
            "season": catalog.season,
            "tasks": sorted(t.key for t in tasks),
            "observations": sorted(s.snapshot_id for s in snapshots),
        }
    )
    current_identities = registry.current()
    coverage = []
    for player in catalog.players:
        identity = current_identities.get((player.player_id, catalog.season))
        status = identity.status if identity else "pending_review"
        rows = by_player.get(player.player_id, [])
        available = [s for _, _, s in rows if s is not None]
        complete = [s for s in available if all(v is not None for v in s.percentiles.values())]
        eligible = [
            s
            for s in complete
            if not (
                s.cohort
                and s.cohort.minimum_minutes is not None
                and s.minutes < s.cohort.minimum_minutes
            )
        ]
        data_status = "not_published"
        reason = {
            "pending_review": "identity_pending",
            "ambiguous": "identity_ambiguous",
            "not_found": "identity_not_found",
            "matched": "not_published",
        }[status]
        if status == "matched" and not identity.roles:
            data_status = reason = "role_unresolved"
        if available:
            if eligible:
                data_status = reason = "ready"
            elif complete:
                data_status = reason = "insufficient_minutes"
            else:
                data_status = reason = "incomplete_metrics"
        elif any(c.get("expired") for _, c, _ in rows):
            reason = "expired"
        defaults = [r.profile for r in identity.roles if r.default] if identity else []
        default = defaults[0] if defaults else None
        attempts = [c["last_attempt_at"] for _, c, _ in rows if c.get("last_attempt_at")]
        errors = {t.role.profile: c["error_code"] for t, c, _ in rows if c.get("error_code")}
        coverage.append(
            RadarCoverage(
                player_id=player.player_id,
                season=catalog.season,
                identity_status=status,
                data_status=data_status,
                reason_code=reason,
                default_profile=default,
                available_profiles=[s.profile for s in available],
                profile_errors=errors,
                last_success_at=max(
                    (
                        RadarSnapshot.model_validate(c["snapshot"]).fetched_at
                        for _, c, _ in rows
                        if c.get("snapshot")
                    ),
                    default=None,
                ),
                last_attempt_at=max(attempts, default=None),
                last_error_code=next(iter(errors.values()), None),
                stale=any(s.stale for s in available),
                dataset_id=dataset_id,
                catalog_snapshot_id=catalog.snapshot_id,
            )
        )
    index: dict[str, list[str]] = {}
    for snapshot in snapshots:
        key = build_radar(snapshot).comparison_key
        if key:
            index.setdefault(key, []).append(f"{snapshot.player_id}:{snapshot.profile}")
    ready = sum(c.data_status == "ready" for c in coverage)
    matched = sum(c.identity_status == "matched" for c in coverage)
    known_eligibility = {
        s.player_id for s in snapshots if s.cohort and s.cohort.minimum_minutes is not None
    }
    eligible_ids = {
        s.player_id
        for s in snapshots
        if s.cohort
        and s.cohort.minimum_minutes is not None
        and s.minutes >= s.cohort.minimum_minutes
    }
    ready_ids = {c.player_id for c in coverage if c.data_status == "ready"}
    coverage_by_id = {c.player_id: c for c in coverage}
    club_report: dict[str, dict[str, int]] = {}
    for player in catalog.players:
        counts = club_report.setdefault(player.club, {"footballers": 0, "ready": 0})
        counts["footballers"] += 1
        counts["ready"] += int(coverage_by_id[player.player_id].data_status == "ready")
    report = inventory_report(catalog) | {
        "by_club_coverage": club_report,
        "by_role": dict(Counter(s.profile for s in snapshots)),
        "eligible_known": len(eligible_ids),
        "eligible_coverage_pct": (
            round(100 * len(ready_ids & eligible_ids) / len(eligible_ids), 2)
            if eligible_ids
            else None
        ),
        "dataset_id": dataset_id,
        "accounted": len(coverage),
        "matched": matched,
        "ready": ready,
        "association_pct": round(100 * matched / len(coverage), 2),
        "complete_radar_pct": round(100 * ready / len(coverage), 2),
        "eligible_unknown": len(coverage) - len(known_eligibility),
        "reasons": dict(Counter(c.reason_code for c in coverage)),
        "profile_errors": dict(
            Counter(error for c in coverage for error in c.profile_errors.values())
        ),
    }
    return PublishedDataset(
        catalog=catalog,
        store=RadarStore(snapshots=snapshots),
        coverage=coverage,
        index={k: sorted(v) for k, v in index.items()},
        report=report,
    )
