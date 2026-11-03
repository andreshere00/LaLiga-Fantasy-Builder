"""Immutable radar releases, bounded validation, atomic promotion and rollback."""

from __future__ import annotations

import fcntl
import os
import re
import shutil
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from fantasy_api.radar.audits import SupplyAudits
from fantasy_api.radar.catalog import CatalogInventory
from fantasy_api.radar.coverage import RadarCoverage
from fantasy_api.radar.files import atomic_json, content_id, read_json, semantic_snapshot_id
from fantasy_api.radar.registry import IdentityRegistry
from fantasy_api.schemas.player_radar import RadarStore

FILES = (
    "catalog.json",
    "radar-store.json",
    "coverage.json",
    "index.json",
    "report.json",
    "provenance.json",
)
LEGACY_FILES = set(FILES) - {"provenance.json"}


class PublishedDataset(BaseModel):
    """Validated single-season views; every catalog footballer is accounted for."""

    model_config = ConfigDict(extra="forbid")
    catalog: CatalogInventory
    store: RadarStore
    coverage: list[RadarCoverage] = Field(max_length=10000)
    index: dict[str, list[str]]
    report: dict[str, Any]
    provenance: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_consistency(self) -> PublishedDataset:
        """Prevent partial coverage, mixed seasons, request-time mappings and orphan data."""
        ids = {row.player_id for row in self.catalog.players}
        coverage_ids = [row.player_id for row in self.coverage]
        if len(coverage_ids) != len(set(coverage_ids)) or set(coverage_ids) != ids:
            raise ValueError("published coverage must account for the complete catalog")
        if self.store.datamb_mappings:
            raise ValueError("published datasets cannot perform request-time ingestion")
        for row in self.store.snapshots:
            if row.player_id not in ids or row.season != self.catalog.season:
                raise ValueError("snapshot outside pinned catalog and season")
        for row in self.coverage:
            if (
                row.season != self.catalog.season
                or row.catalog_snapshot_id != self.catalog.snapshot_id
            ):
                raise ValueError("coverage belongs to another catalog or season")
        for row in self.coverage:
            profiles = {s.profile for s in self.store.snapshots if s.player_id == row.player_id}
            if set(row.available_profiles) != profiles:
                raise ValueError("coverage profiles do not match served observations")
            if profiles and row.identity_status != "matched":
                raise ValueError("observations require a reviewed identity")
        dataset_ids = {row.dataset_id for row in self.coverage}
        if (
            len(dataset_ids) != 1
            or self.report.get("dataset_id") not in dataset_ids
            or self.report.get("accounted") != len(ids)
            or self.report.get("catalog_snapshot_id") != self.catalog.snapshot_id
        ):
            raise ValueError("publication report does not match its catalog and coverage")
        if self.provenance is not None:
            provenance = self.provenance
            if (
                provenance.get("format") not in {"radar-provenance-v1", "radar-provenance-v2"}
                or provenance.get("catalog_snapshot_id") != self.catalog.snapshot_id
                or provenance.get("season") != self.catalog.season
            ):
                raise ValueError("provenance does not match its published catalog")
            if (provenance["format"] == "radar-provenance-v2") != ("eligibility" in provenance):
                raise ValueError("provenance version does not match eligibility contract")
            registry = IdentityRegistry.model_validate({"records": provenance.get("identities")})
            audits = SupplyAudits.model_validate({"audits": provenance.get("audits")})
            audit_by_id = {audit.audit_id: audit for audit in audits.audits}
            task_hashes = []
            for identity in registry.current().values():
                if identity.player_id not in ids or identity.season != self.catalog.season:
                    raise ValueError("provenance identity outside catalog")
                if identity.status != "matched":
                    continue
                for role in identity.roles:
                    audit = audit_by_id.get(role.audit_id)
                    if audit is None:
                        raise ValueError("provenance has no audit for its approved role")
                    task_hashes.append(
                        content_id(
                            {
                                "identity": identity.model_dump(mode="json"),
                                "role": role.model_dump(mode="json"),
                                "audit": audit.model_dump(mode="json"),
                            }
                        )
                    )
            if sorted(task_hashes) != provenance.get("task_hashes"):
                raise ValueError("provenance tasks do not match reviewed inputs")
            if any(s.snapshot_id != semantic_snapshot_id(s) for s in self.store.snapshots):
                raise ValueError("observation content hash differs from stored identity")
            identity_payload = {
                "catalog": self.catalog.snapshot_id,
                "season": self.catalog.season,
                "tasks": sorted(task_hashes),
                "observations": sorted(s.snapshot_id for s in self.store.snapshots),
            }
            if "eligibility" in provenance:
                from fantasy_api.radar.eligibility import RadarEligibility

                policy = RadarEligibility.model_validate(provenance["eligibility"])
                if policy.season != self.catalog.season:
                    raise ValueError("eligibility season mismatch")
                teams = {p.player_id: p.team_id for p in self.catalog.players}
                if any(policy.exclusion(s, teams[s.player_id]) for s in self.store.snapshots):
                    raise ValueError("published observation violates eligibility policy")
                identity_payload["eligibility"] = policy.model_dump(mode="json")
            expected_id = content_id(identity_payload)
            if expected_id != self.report["dataset_id"]:
                raise ValueError("published observations do not match provenance")
        # Import locally to keep service -> repository -> releases imports acyclic.
        from fantasy_api.services.player_radar import build_radar

        expected: dict[str, list[str]] = {}
        for row in self.store.snapshots:
            key = build_radar(row).comparison_key
            if key:
                expected.setdefault(key, []).append(f"{row.player_id}:{row.profile}")
        expected = {key: sorted(values) for key, values in expected.items()}
        if self.index != expected:
            raise ValueError("comparison index does not match published snapshots")
        return self

    def files(self) -> dict[str, Any]:
        """Serialize all served views before an immutable release is promoted."""
        return {
            "catalog.json": self.catalog.model_dump(mode="json"),
            "radar-store.json": self.store.model_dump(mode="json"),
            "coverage.json": [row.model_dump(mode="json") for row in self.coverage],
            "index.json": self.index,
            "report.json": self.report,
            "provenance.json": self.provenance,
        }


@contextmanager
def publisher_lock(root: Path) -> Iterator[None]:
    """Fail fast when another process owns the writer; kernels release locks on exit."""
    root.mkdir(parents=True, exist_ok=True)
    with (root / ".publisher.lock").open("a") as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("another radar publisher is running") from None
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


def load_release(root: Path, release_id: str | None = None) -> PublishedDataset:
    """Pin a current release once, then validate hashes and all views without network I/O."""
    if release_id is None:
        pointer = read_json(root / "current.json")
        if not isinstance(pointer, dict):
            raise ValueError("invalid release pointer")
        release_id = pointer["release_id"]
    if not isinstance(release_id, str) or not re.fullmatch(r"[a-f0-9]{64}", release_id):
        raise ValueError("invalid release reference")
    directory = root / "releases" / release_id
    manifest = read_json(directory / "manifest.json")
    if (
        not isinstance(manifest, dict)
        or manifest.get("release_id") != release_id
        or set(manifest.get("files", {})) not in (set(FILES), LEGACY_FILES)
    ):
        raise ValueError("invalid release manifest")
    values = {name: read_json(directory / name) for name in manifest["files"]}
    hashes = {name: content_id(value) for name, value in values.items()}
    if hashes != manifest["files"] or content_id(hashes) != release_id:
        raise ValueError("release checksum mismatch")
    return PublishedDataset(
        catalog=values["catalog.json"],
        store=values["radar-store.json"],
        coverage=values["coverage.json"],
        index=values["index.json"],
        report=values["report.json"],
        provenance=values.get("provenance.json"),
    )


def publish_release(root: Path, dataset: PublishedDataset) -> str:
    """Validate a release on disk before atomically changing the durable current pointer."""
    if dataset.provenance is None:
        raise ValueError("revalidate legacy datasets before publishing their provenance")
    with publisher_lock(root):
        values = dataset.files()
        hashes = {name: content_id(value) for name, value in values.items()}
        release_id = content_id(hashes)
        releases = root / "releases"
        releases.mkdir(exist_ok=True)
        temporary = Path(tempfile.mkdtemp(dir=releases, prefix=".staging-"))
        try:
            for name, value in values.items():
                atomic_json(temporary / name, value)
            atomic_json(temporary / "manifest.json", {"release_id": release_id, "files": hashes})
            destination = releases / release_id
            if not destination.exists():
                temporary.rename(destination)
                fd = os.open(releases, os.O_RDONLY)
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
            load_release(root, release_id)
            atomic_json(root / "current.json", {"release_id": release_id})
            return release_id
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)


def rollback_release(root: Path, release_id: str) -> None:
    """Promote only a fully validated existing release, with the same writer lock."""
    with publisher_lock(root):
        load_release(root, release_id)
        atomic_json(root / "current.json", {"release_id": release_id})
