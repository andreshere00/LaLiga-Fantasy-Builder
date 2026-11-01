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

from fantasy_api.radar.catalog import CatalogInventory
from fantasy_api.radar.coverage import RadarCoverage
from fantasy_api.radar.files import atomic_json, content_id, read_json
from fantasy_api.schemas.player_radar import RadarStore

FILES = ("catalog.json", "radar-store.json", "coverage.json", "index.json", "report.json")


class PublishedDataset(BaseModel):
    """Validated single-season views; every catalog footballer is accounted for."""

    model_config = ConfigDict(extra="forbid")
    catalog: CatalogInventory
    store: RadarStore
    coverage: list[RadarCoverage] = Field(max_length=10000)
    index: dict[str, list[str]]
    report: dict[str, Any]

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
        release_id = read_json(root / "current.json")["release_id"]
    if not isinstance(release_id, str) or not re.fullmatch(r"[a-f0-9]{64}", release_id):
        raise ValueError("invalid release reference")
    directory = root / "releases" / release_id
    manifest = read_json(directory / "manifest.json")
    if manifest.get("release_id") != release_id or set(manifest.get("files", {})) != set(FILES):
        raise ValueError("invalid release manifest")
    values = {name: read_json(directory / name) for name in FILES}
    hashes = {name: content_id(value) for name, value in values.items()}
    if hashes != manifest["files"] or content_id(hashes) != release_id:
        raise ValueError("release checksum mismatch")
    return PublishedDataset(
        catalog=values["catalog.json"],
        store=values["radar-store.json"],
        coverage=values["coverage.json"],
        index=values["index.json"],
        report=values["report.json"],
    )


def publish_release(root: Path, dataset: PublishedDataset) -> str:
    """Validate a release on disk before atomically changing the durable current pointer."""
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
