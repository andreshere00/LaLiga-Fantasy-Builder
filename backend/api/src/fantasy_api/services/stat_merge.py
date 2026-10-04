"""Stat fallback chain and conflict handling."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from fantasy_api.schemas.player_stats import (
    FixtureStats,
    SegmentWarning,
    StatKey,
    StatSource,
    StatValue,
    default_stat_value,
)
from fantasy_api.schemas.scraped import ScrapedStat

_STAT_FIELDS: tuple[tuple[StatKey, str], ...] = tuple((StatKey(key), key) for key in StatKey)


def _coerce_stat(
    value: ScrapedStat | None,
    source: StatSource,
    *,
    stat_key: StatKey,
) -> StatValue:
    if value is None:
        return default_stat_value()
    fantasy_points = 0
    dazn_points = 0
    if stat_key == StatKey.DAZN_POINTS:
        dazn_points = int(value.points or 0)
    else:
        fantasy_points = int(value.points or 0)
    return StatValue(
        count=value.count,
        fantasy_points=fantasy_points,
        dazn_points=dazn_points,
        source=source,
    )


def merge_fixture_stats(
    layers: Sequence[tuple[StatSource, Mapping[StatKey, ScrapedStat]]],
) -> tuple[FixtureStats, list[SegmentWarning]]:
    """Merge stat layers; first non-null count or points wins."""
    warnings: list[SegmentWarning] = []
    merged: dict[StatKey, StatValue] = {}
    for stat_key, field_name in _STAT_FIELDS:
        winner: StatValue | None = None
        for source, layer in layers:
            scraped = layer.get(stat_key)
            if scraped is None:
                continue
            candidate = _coerce_stat(scraped, source, stat_key=stat_key)
            has_value = (
                candidate.count is not None
                or candidate.fantasy_points
                or (stat_key == StatKey.DAZN_POINTS and candidate.dazn_points)
            )
            if not has_value:
                continue
            if winner is None:
                winner = candidate
                continue
            if (
                winner.count is not None
                and candidate.count is not None
                and winner.count != candidate.count
            ) or (winner.fantasy_points != candidate.fantasy_points and candidate.fantasy_points):
                warnings.append(
                    SegmentWarning(
                        code="source_conflict",
                        source=source.value,
                        detail=field_name,
                    )
                )
                continue
        merged[stat_key] = winner or default_stat_value()
    payload = {field: merged[key] for key, field in _STAT_FIELDS}
    return FixtureStats(**payload), warnings
