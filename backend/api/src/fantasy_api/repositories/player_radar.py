"""Read explicit radar datasets and private source snapshots without provider fallback."""

from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path

from pydantic import ValidationError

from fantasy_api.clients.scraping import ScrapingClient
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.radar.profiles import PROFILES
from fantasy_api.schemas.player_radar import DataMBPlayer, RadarSnapshot, RadarStore


class PlayerRadarRepository:
    """Load bounded operator-managed snapshots and reviewed DataMB identity mappings."""

    def __init__(self, store_path: str, scraper: ScrapingClient) -> None:
        self._path = Path(store_path) if store_path else None
        self._scraper = scraper
        self._observed: dict[tuple[str, str], RadarSnapshot] = {}

    def _read_store(self) -> RadarStore:
        """Validate the configured file on each read; updates must use atomic replacement."""
        if self._path is None:
            return RadarStore()
        try:
            with self._path.open("rb") as stream:
                data = stream.read(5 * 1024 * 1024 + 1)
            if len(data) > 5 * 1024 * 1024:
                raise ValueError("radar dataset too large")
            payload = json.loads(data)
            if not isinstance(payload, dict) or not {"snapshots", "datamb_mappings"}.intersection(
                payload
            ):
                raise ValueError("unrecognized radar store")
            return RadarStore.model_validate(payload)
        except (OSError, ValueError):
            raise UpstreamError(
                "Radar dataset is unavailable or invalid", category="radar_dataset_invalid"
            ) from None

    async def get_snapshots(
        self, player_id: str, season: str, profile: str | None
    ) -> tuple[list[RadarSnapshot], list[str]]:
        """Read one player's eligible profiles and validate every provider response."""
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
            payload = await self._scraper.get_json(
                "/internal/radar/datamb",
                {"profile_key": mapping.profile_key, "season": season},
            )
            try:
                row = DataMBPlayer.model_validate(payload)
                if (
                    row.name != mapping.expected_name
                    or row.position != mapping.source_position
                    or row.season != season
                    or row.metric_labels != mapping.source_labels
                ):
                    raise ValueError("source identity or metric mapping changed")
                digest = hashlib.sha256(row.model_dump_json().encode()).hexdigest()
                snapshots.append(
                    RadarSnapshot(
                        player_id=player_id,
                        player=row.name,
                        club=row.club,
                        age=row.age,
                        season=season,
                        competition=row.league,
                        period="league season",
                        minutes=row.minutes,
                        profile=mapping.profile,
                        source="datamb",
                        method="provider_native_percentile",
                        recipe_version="datamb-reviewed-v1",
                        snapshot_id=digest,
                        fetched_at=row.fetched_at,
                        cohort=mapping.cohort,
                        stale=row.stale,
                        source_metrics={
                            key: label
                            for (key, _, _), label in zip(
                                PROFILES[mapping.profile].metrics, row.metric_labels, strict=True
                            )
                        },
                        percentiles={
                            key: value
                            for (key, _label, _definition), value in zip(
                                PROFILES[mapping.profile].metrics, row.percentiles, strict=True
                            )
                        },
                    )
                )
                self._observed[(player_id, mapping.profile)] = snapshots[-1]
                seasons = sorted(set(seasons) | {season}, reverse=True)
            except (ValueError, ValidationError):
                raise UpstreamError(
                    "Radar provider returned invalid data", category="radar_source_invalid"
                ) from None
        return snapshots, seasons

    async def comparison_snapshots(self) -> list[RadarSnapshot]:
        """Read known candidates without making per-player network requests."""
        store = await asyncio.to_thread(self._read_store)
        return store.snapshots + list(self._observed.values())
