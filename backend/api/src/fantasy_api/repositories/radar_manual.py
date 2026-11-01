"""Explicit transitional manual mappings; immutable published reads never use this path."""

import hashlib

from fantasy_api.clients.scraping import ScrapingClient
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.radar.profiles import PROFILES
from fantasy_api.schemas.player_radar import DataMBMapping, DataMBPlayer, RadarSnapshot


async def fetch_manual_mapping(
    scraper: ScrapingClient,
    mapping: DataMBMapping,
    season: str,
) -> RadarSnapshot:
    """Validate one pre-reviewed mapping using the existing private source contract."""
    payload = await scraper.get_json(
        "/internal/radar/datamb",
        {
            "profile_key": mapping.profile_key,
            "season": season,
        },
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
        return RadarSnapshot(
            player_id=mapping.player_id,
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
            snapshot_id=hashlib.sha256(row.model_dump_json().encode()).hexdigest(),
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
                for (key, _, _), value in zip(
                    PROFILES[mapping.profile].metrics, row.percentiles, strict=True
                )
            },
        )
    except ValueError:
        raise UpstreamError(
            "Radar provider returned invalid data", category="radar_source_invalid"
        ) from None
