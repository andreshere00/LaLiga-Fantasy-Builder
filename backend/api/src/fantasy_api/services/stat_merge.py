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
from fantasy_api.services.fantasy_official_scoring import compute_official_fantasy_points

_STAT_FIELDS: tuple[tuple[StatKey, str], ...] = tuple((StatKey(key), key) for key in StatKey)


def _fantasy_points_sum(stats: FixtureStats) -> int:
    total = 0
    for stat_key, field_name in _STAT_FIELDS:
        if stat_key == StatKey.DAZN_POINTS:
            continue
        points = getattr(stats, field_name).fantasy_points
        if points is not None:
            total += points
    return total


def _explained_total(stats: FixtureStats) -> tuple[int, int]:
    """Action points plus the match DAZN note."""
    dazn = stats.dazn_points.dazn_points or 0
    return _fantasy_points_sum(stats), dazn


def _has_fantasy_points(stats: FixtureStats) -> bool:
    for stat_key, field_name in _STAT_FIELDS:
        if stat_key == StatKey.DAZN_POINTS:
            continue
        if getattr(stats, field_name).fantasy_points is not None:
            return True
    return False


def _mismatch_detail(actions: int, dazn: int, total: int) -> str:
    if dazn:
        return f"{actions}+{dazn}!={total}"
    return f"{actions}!={total}"


def apply_computed_official_fallback(
    stats: FixtureStats,
    *,
    position_id: int | None,
    minutes_played: int | None,
    fantasy_points_total: int | None,
) -> tuple[FixtureStats, list[SegmentWarning]]:
    """Fill null fantasy_points from Zendesk rules. Warn when the sum misses the total."""
    if fantasy_points_total is not None and _has_fantasy_points(stats):
        actions, dazn = _explained_total(stats)
        if actions + dazn == fantasy_points_total:
            return stats, []
    computed = compute_official_fantasy_points(
        stats,
        position_id=position_id,
        minutes_played=minutes_played,
    )
    if not computed:
        return stats, []
    updates: dict[str, StatValue] = {}
    for stat_key, field_name in _STAT_FIELDS:
        if stat_key == StatKey.DAZN_POINTS:
            continue
        current = getattr(stats, field_name)
        if current.fantasy_points is not None:
            continue
        if stat_key not in computed:
            continue
        if stat_key != StatKey.MINUTES_PLAYED and current.count is None:
            continue
        updates[field_name] = current.model_copy(
            update={
                "fantasy_points": computed[stat_key],
                "source": StatSource.COMPUTED_OFFICIAL,
            }
        )
    if not updates:
        return stats, []
    candidate = stats.model_copy(update=updates)
    warnings: list[SegmentWarning] = []
    if fantasy_points_total is not None:
        actions, dazn = _explained_total(candidate)
        if actions + dazn != fantasy_points_total:
            warnings.append(
                SegmentWarning(
                    code="computed_points_mismatch",
                    source=StatSource.COMPUTED_OFFICIAL.value,
                    detail=_mismatch_detail(actions, dazn, fantasy_points_total),
                )
            )
    return candidate, warnings


def merge_fixture_stats(
    layers: Sequence[tuple[StatSource, Mapping[StatKey, ScrapedStat]]],
    *,
    fantasy_points_total: int | None = None,
    position_id: int | None = None,
    minutes_played: int | None = None,
) -> tuple[FixtureStats, list[SegmentWarning]]:
    """Merge stat layers; count and points may come from different sources."""
    warnings: list[SegmentWarning] = []
    merged: dict[StatKey, StatValue] = {}
    for stat_key, field_name in _STAT_FIELDS:
        count: int | None = None
        fantasy_points: int | None = None
        dazn_points: int | None = None
        source = StatSource.UNAVAILABLE
        for stat_source, layer in layers:
            scraped = layer.get(stat_key)
            if scraped is None:
                continue
            if scraped.count is not None:
                if count is not None and count != scraped.count:
                    warnings.append(
                        SegmentWarning(
                            code="source_conflict",
                            source=stat_source.value,
                            detail=field_name,
                        )
                    )
                elif count is None:
                    count = scraped.count
                    source = stat_source
            if stat_key == StatKey.DAZN_POINTS:
                if scraped.points is not None:
                    points = int(scraped.points)
                    if dazn_points is not None and dazn_points != points:
                        warnings.append(
                            SegmentWarning(
                                code="source_conflict",
                                source=stat_source.value,
                                detail=field_name,
                            )
                        )
                    elif dazn_points is None:
                        dazn_points = points
                        if source == StatSource.UNAVAILABLE:
                            source = stat_source
            elif scraped.points is not None:
                points = int(scraped.points)
                if fantasy_points is not None and fantasy_points != points:
                    warnings.append(
                        SegmentWarning(
                            code="source_conflict",
                            source=stat_source.value,
                            detail=field_name,
                        )
                    )
                elif fantasy_points is None:
                    fantasy_points = points
                    if source == StatSource.UNAVAILABLE:
                        source = stat_source
        if count is None and fantasy_points is None and dazn_points is None:
            merged[stat_key] = default_stat_value()
        else:
            merged[stat_key] = StatValue(
                count=count,
                fantasy_points=fantasy_points,
                dazn_points=dazn_points,
                source=source,
            )
    stats = FixtureStats(**{field: merged[key] for key, field in _STAT_FIELDS})
    if fantasy_points_total is not None and _has_fantasy_points(stats):
        actions, dazn = _explained_total(stats)
        if actions + dazn != fantasy_points_total:
            warnings.append(
                SegmentWarning(
                    code="points_total_mismatch",
                    source=StatSource.FUTBOLFANTASY.value,
                    detail=_mismatch_detail(actions, dazn, fantasy_points_total),
                )
            )
    fallback, fb_warnings = apply_computed_official_fallback(
        stats,
        position_id=position_id,
        minutes_played=minutes_played,
        fantasy_points_total=fantasy_points_total,
    )
    warnings.extend(fb_warnings)
    return fallback, warnings
