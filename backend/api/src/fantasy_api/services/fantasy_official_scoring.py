"""LaLiga Fantasy Oficial point rules (Zendesk public guide)."""

from __future__ import annotations

from fantasy_api.schemas.player_stats import FixtureStats, StatKey

_GOAL_POINTS: dict[int, int] = {1: 6, 2: 6, 3: 5, 4: 4}
_CONCEDED_PER_PAIR: dict[int, int] = {1: -2, 2: -2, 3: -1, 4: -1}
_CLEAN_SHEET: dict[int, int] = {1: 4, 2: 3, 3: 2, 4: 1}
_BALLS_LOST_EVERY: dict[int, int] = {1: 8, 2: 8, 3: 10, 4: 12}


def _bucket(count: int, every: int, points: int) -> int:
    if every <= 0 or count <= 0:
        return 0
    return (count // every) * points


def _minutes_points(minutes: int) -> int:
    if minutes <= 0:
        return 0
    return 2 if minutes >= 60 else 1


def _resolve_minutes(stats: FixtureStats, minutes_played: int | None) -> int | None:
    stat_minutes = stats.minutes_played.count
    if stat_minutes is not None:
        return stat_minutes
    return minutes_played


def official_points_for_key(
    key: StatKey,
    count: int,
    *,
    position_id: int,
    minutes: int | None,
) -> int | None:
    """Return Fantasy Oficial points for one stat count, or None if unsupported."""
    if position_id not in _GOAL_POINTS:
        return None
    if key == StatKey.MINUTES_PLAYED:
        if minutes is None:
            return None
        return _minutes_points(minutes)
    if key == StatKey.GOALS:
        return count * _GOAL_POINTS[position_id]
    if key == StatKey.ASSISTS:
        return count * 3
    if key == StatKey.BIG_CHANCES_CREATED:
        return count * 1
    if key == StatKey.BALLS_INTO_BOX:
        return _bucket(count, 2, 1)
    if key == StatKey.PENALTIES_MISSED:
        return count * -2
    if key == StatKey.PENALTIES_SAVED:
        return count * 5
    if key == StatKey.PENALTIES_COMMITTED:
        return count * -2
    if key == StatKey.PENALTIES_WON:
        return count * 2
    if key == StatKey.GOALS_CONCEDED:
        if count == 0 and minutes is not None and minutes >= 60:
            return _CLEAN_SHEET[position_id]
        return _bucket(count, 2, _CONCEDED_PER_PAIR[position_id])
    if key == StatKey.YELLOW_CARDS:
        return count * -1
    if key == StatKey.RED_CARD:
        return count * -3
    if key == StatKey.OWN_GOALS:
        return count * -2
    if key == StatKey.SAVES:
        return _bucket(count, 2, 1)
    if key == StatKey.SHOTS:
        return _bucket(count, 2, 1)
    if key == StatKey.SUCCESSFUL_DRIBBLES:
        return _bucket(count, 2, 1)
    if key == StatKey.RECOVERIES:
        return _bucket(count, 5, 1)
    if key == StatKey.CLEARANCES:
        return _bucket(count, 3, 1)
    if key == StatKey.BALLS_LOST:
        every = _BALLS_LOST_EVERY[position_id]
        return _bucket(count, every, -1)
    return None


def compute_official_fantasy_points(
    stats: FixtureStats,
    *,
    position_id: int | None,
    minutes_played: int | None,
) -> dict[StatKey, int]:
    """Build per-stat Fantasy Oficial points from counts (Zendesk rules)."""
    if position_id is None:
        return {}
    minutes = _resolve_minutes(stats, minutes_played)
    out: dict[StatKey, int] = {}
    for stat_key, field_name in _STAT_FIELDS:
        if stat_key == StatKey.DAZN_POINTS:
            continue
        value = getattr(stats, field_name)
        if value.count is None:
            if stat_key == StatKey.MINUTES_PLAYED and minutes is not None:
                points = official_points_for_key(
                    stat_key, minutes, position_id=position_id, minutes=minutes
                )
                if points is not None:
                    out[stat_key] = points
            continue
        points = official_points_for_key(
            stat_key,
            value.count,
            position_id=position_id,
            minutes=minutes,
        )
        if points is not None:
            out[stat_key] = points
    return out


_STAT_FIELDS: tuple[tuple[StatKey, str], ...] = (
    (StatKey.MINUTES_PLAYED, "minutes_played"),
    (StatKey.GOALS, "goals"),
    (StatKey.ASSISTS, "assists"),
    (StatKey.BIG_CHANCES_CREATED, "big_chances_created"),
    (StatKey.BALLS_INTO_BOX, "balls_into_box"),
    (StatKey.PENALTIES_COMMITTED, "penalties_committed"),
    (StatKey.PENALTIES_WON, "penalties_won"),
    (StatKey.PENALTIES_SAVED, "penalties_saved"),
    (StatKey.SAVES, "saves"),
    (StatKey.CLEARANCES, "clearances"),
    (StatKey.PENALTIES_MISSED, "penalties_missed"),
    (StatKey.OWN_GOALS, "own_goals"),
    (StatKey.GOALS_CONCEDED, "goals_conceded"),
    (StatKey.YELLOW_CARDS, "yellow_cards"),
    (StatKey.RED_CARD, "red_card"),
    (StatKey.SHOTS, "shots"),
    (StatKey.SUCCESSFUL_DRIBBLES, "successful_dribbles"),
    (StatKey.RECOVERIES, "recoveries"),
    (StatKey.BALLS_LOST, "balls_lost"),
)
