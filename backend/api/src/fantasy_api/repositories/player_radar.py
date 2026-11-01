"""Read pinned local releases or explicitly configured transitional source mappings."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING

from fantasy_api.clients.scraping import ScrapingClient
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.radar.coverage import RadarCoverage
from fantasy_api.radar.files import read_json
from fantasy_api.schemas.player_radar import RadarSnapshot, RadarStore

if TYPE_CHECKING:
    from fantasy_api.radar.releases import PublishedDataset


class PlayerRadarRepository:
    """Pin immutable local datasets; retain manual MVP mode as an explicit transition."""

    def __init__(
        self,
        store_path: str,
        scraper: ScrapingClient,
        *,
        dataset_root: str = "",
        stale_days: int = 8,
        maximum_days: int = 30,
        dataset: PublishedDataset | None = None,
    ) -> None:
        self._path = Path(store_path) if store_path else None
        self._root = Path(dataset_root) if dataset_root else None
        self._scraper = scraper
        self._dataset = dataset
        self._stale_days = stale_days
        self._maximum_days = maximum_days
        self._observed: dict[tuple[str, str, str], RadarSnapshot] = {}

    @property
    def stale_hours(self) -> int:
        """Use the weekly publication threshold only for pinned dataset mode."""
        return self._stale_days * 24 if self._dataset else 72

    @property
    def published(self) -> bool:
        """Distinguish weekly local publications from the transitional manual MVP mode."""
        return self._dataset is not None

    async def pin(self) -> PlayerRadarRepository:
        """Read the current pointer once for primary, coverage and comparison in one request."""
        if self._root is None:
            return self
        from fantasy_api.radar.releases import load_release

        try:
            dataset = await asyncio.to_thread(load_release, self._root)
            return PlayerRadarRepository(
                "",
                self._scraper,
                dataset=dataset,
                stale_days=self._stale_days,
                maximum_days=self._maximum_days,
            )
        except (OSError, ValueError, KeyError, TypeError):
            raise UpstreamError(
                "Radar dataset is unavailable or invalid", category="radar_dataset_invalid"
            ) from None

    def _read_store(self) -> RadarStore:
        """Validate configured input; published mode never reads provider mappings."""
        if self._dataset:
            current = datetime.now(UTC)
            snapshots = [
                s.model_copy(
                    update={
                        "stale": s.stale
                        or current - s.fetched_at > timedelta(days=self._stale_days)
                    }
                )
                for s in self._dataset.store.snapshots
                if current - s.fetched_at <= timedelta(days=self._maximum_days)
            ]
            return RadarStore(snapshots=snapshots)
        if self._path is None:
            return RadarStore()
        try:
            payload = read_json(self._path)
            if not isinstance(payload, dict) or not {"snapshots", "datamb_mappings"}.intersection(
                payload
            ):
                raise ValueError("unrecognized radar store")
            return RadarStore.model_validate(payload)
        except (OSError, ValueError):
            raise UpstreamError(
                "Radar dataset is unavailable or invalid", category="radar_dataset_invalid"
            ) from None

    def coverage(self, player_id: str, season: str) -> RadarCoverage | None:
        """Return pinned coverage with elapsed-time expiration, without altering retrieval dates."""
        if not self._dataset:
            return None
        coverage = next((c for c in self._dataset.coverage if c.player_id == player_id), None)
        if coverage is None:
            return RadarCoverage(
                player_id=player_id,
                season=season,
                identity_status="not_found",
                data_status="out_of_scope",
                reason_code="out_of_scope",
                dataset_id=self._dataset.report["dataset_id"],
                catalog_snapshot_id=self._dataset.catalog.snapshot_id,
            )
        if season != coverage.season:
            return coverage.model_copy(
                update={
                    "season": season,
                    "data_status": "season_unavailable",
                    "reason_code": "season_unavailable",
                    "available_profiles": [],
                }
            )
        store = self._read_store()
        rows = [s for s in store.snapshots if s.player_id == player_id and s.season == season]
        profiles = [s.profile for s in rows]
        expired = set(coverage.available_profiles) - set(profiles)
        updates = {"available_profiles": profiles, "stale": any(s.stale for s in rows)}
        if expired:
            updates["profile_errors"] = coverage.profile_errors | {p: "expired" for p in expired}
            if not profiles:
                updates |= {"data_status": "not_published", "reason_code": "expired"}
        return coverage.model_copy(update=updates)

    async def get_snapshots(
        self,
        player_id: str,
        season: str,
        profile: str | None,
    ) -> tuple[list[RadarSnapshot], list[str]]:
        """Read one master ID's profiles; published mode performs no external requests."""
        store = await asyncio.to_thread(self._read_store)
        seasons = sorted(
            {s.season for s in store.snapshots if s.player_id == player_id}, reverse=True
        )
        snapshots = [
            s
            for s in store.snapshots
            if s.player_id == player_id
            and s.season == season
            and (profile is None or s.profile == profile)
        ]
        for mapping in store.datamb_mappings:
            if mapping.player_id != player_id or (profile and mapping.profile != profile):
                continue
            # The compatibility path remains explicit. Bulk publications never have mappings.
            from fantasy_api.repositories.radar_manual import fetch_manual_mapping

            row = await fetch_manual_mapping(self._scraper, mapping, season)
            snapshots.append(row)
            self._observed[(player_id, season, mapping.profile)] = row
            seasons = sorted(set(seasons) | {season}, reverse=True)
        return snapshots, seasons

    async def comparison_snapshots(self, keys: set[str] | None = None) -> list[RadarSnapshot]:
        """Use the immutable candidate index, independent of worker visits and cache state."""
        store = await asyncio.to_thread(self._read_store)
        if self._dataset and keys is not None:
            ids = {reference for key in keys for reference in self._dataset.index.get(key, [])}
            return [s for s in store.snapshots if f"{s.player_id}:{s.profile}" in ids]
        return store.snapshots + list(self._observed.values())
