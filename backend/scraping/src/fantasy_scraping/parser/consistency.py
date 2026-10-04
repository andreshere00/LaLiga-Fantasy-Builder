"""Cross-section checks. Warnings only; values stay as published."""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fantasy_scraping.parser.extractors.base import sort_warnings
from fantasy_scraping.parser.models.common import PartialParseWarning
from fantasy_scraping.parser.models.futbolfantasy import (
    FixtureRow,
    FutbolFantasyPlayer,
    same_fixture,
)
from fantasy_scraping.parser.normalise.dates import season_from_slug, season_window


def apply_consistency(player: FutbolFantasyPlayer, season: str) -> FutbolFantasyPlayer:
    """Add invariant warnings.

    Args:
        player: Parsed player.
        season: Page season key, such as ``2026-27``.

    Returns:
        The same data with consistency warnings appended.
    """
    extra: list[PartialParseWarning] = []
    _minutes(player, extra)
    _points(player, extra)
    _home_away(player, extra)
    _average(player, extra)
    _market(player, extra)
    _injuries(player, extra)
    _recent(player, extra)
    _market_season(player, season, extra)
    _season_dates(player, season, extra)
    if not extra:
        return player
    return player.model_copy(update={"warnings": sort_warnings([*player.warnings, *extra])})


def _warn(extra: list[PartialParseWarning], code: str, path: str) -> None:
    extra.append(
        PartialParseWarning(
            code=code,
            section="consistency",
            path=path,
            rule_id=code,
            message="published figures disagree",
            severity="warning",
        )
    )


def _base_slug(player: FutbolFantasyPlayer) -> str:
    return player.meta.season_url or ""


def _base_fixtures(player: FutbolFantasyPlayer) -> list[FixtureRow]:
    slug = _base_slug(player)
    if not slug:
        return list(player.fixtures)
    return [row for row in player.fixtures if row.competition_slug == slug]


def _minutes(player: FutbolFantasyPlayer, extra: list[PartialParseWarning]) -> None:
    stats = player.season_stats
    if stats is None or stats.participation is None or stats.participation.minutes is None:
        return
    rows = _base_fixtures(player)
    if not rows:
        return
    has_unknown = any(row.minutes_out.minutes is None for row in rows)
    known = [row.minutes_out.minutes for row in rows if row.minutes_out.minutes is not None]
    if has_unknown:
        _warn(extra, "minutes_assumed_unknown", "fixtures.minutes_out.minutes")
    if not known or has_unknown:
        return
    total = sum(known)
    if total != stats.participation.minutes:
        _warn(extra, "minutes_sum_mismatch", "season_stats.participation.minutes")


def _points(player: FutbolFantasyPlayer, extra: list[PartialParseWarning]) -> None:
    points = player.fantasy_points
    if points is None or points.total.net is None:
        return
    rows = _base_fixtures(player)
    total = sum(row.week_points or 0 for row in rows)
    if rows and int(points.total.net) != total:
        _warn(extra, "points_sum_mismatch", "fantasy_points.total.net")


def _home_away(player: FutbolFantasyPlayer, extra: list[PartialParseWarning]) -> None:
    points = player.fantasy_points
    if points is None or points.total.net is None:
        return
    if points.total_home.net is None or points.total_away.net is None:
        return
    if points.total_home.net + points.total_away.net != points.total.net:
        _warn(extra, "home_away_total_mismatch", "fantasy_points.total.net")


def _average(player: FutbolFantasyPlayer, extra: list[PartialParseWarning]) -> None:
    points = player.fantasy_points
    if points is None or points.total.net is None or points.average.net is None:
        return
    matches = points.matches_counted
    if not matches:
        return
    expected = Decimal(str(points.total.net)) / Decimal(matches)
    rounded = expected.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    actual = Decimal(str(points.average.net)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if rounded != actual:
        _warn(extra, "average_mismatch", "fantasy_points.average.net")
    if points.average_last_3.net is None:
        return
    rows = _base_fixtures(player)
    with_points = [row for row in rows if row.week_points is not None]
    if len(with_points) < 3:
        return
    newest = sorted(with_points, key=lambda row: row.date or date.min, reverse=True)[:3]
    last = sum(row.week_points or 0 for row in newest) / 3
    last_rounded = Decimal(str(last)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    published = Decimal(str(points.average_last_3.net)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    if last_rounded != published:
        _warn(extra, "average_mismatch", "fantasy_points.average_last_3.net")


def _market(player: FutbolFantasyPlayer, extra: list[PartialParseWarning]) -> None:
    market = player.market
    if market is None or len(market.daily_moves) < 2:
        return
    for index, move in enumerate(market.daily_moves[:-1]):
        delta = move.value - market.daily_moves[index + 1].value
        if delta != move.change:
            _warn(extra, "market_moves_mismatch", "market.daily_moves")
            return


def _injuries(player: FutbolFantasyPlayer, extra: list[PartialParseWarning]) -> None:
    history = player.profile.injury_history
    if history is None:
        return
    for entry in history.entries:
        if entry.end is None or entry.duration_days is None:
            continue
        elapsed = max((entry.end - entry.start).days, 1)
        if elapsed != entry.duration_days:
            _warn(extra, "injury_duration_mismatch", "profile.injury_history.entries")
            return
    zones = {item.zone.casefold(): item.incidents for item in history.body_map}
    if "todas" in zones:
        named = sum(count for zone, count in zones.items() if zone not in {"todas", "otros"})
        if named != zones["todas"]:
            _warn(extra, "injury_map_total_mismatch", "profile.injury_history.body_map")


def _recent(player: FutbolFantasyPlayer, extra: list[PartialParseWarning]) -> None:
    for row in player.matches.recent:
        if row.competition.value != "laliga" or row.score is None:
            continue
        matched = False
        for fixture in player.fixtures:
            if fixture.competition.value != "laliga":
                continue
            if same_fixture(fixture, on=row.date, score=row.score, matchday=row.matchday):
                matched = True
        if not matched:
            _warn(extra, "recent_vs_fixtures_mismatch", "matches.recent")
            return


def _market_season(
    player: FutbolFantasyPlayer,
    season: str,
    extra: list[PartialParseWarning],
) -> None:
    market = player.market
    if market is None or not market.widget_season:
        return
    parts = season.split("-")
    if len(parts) != 2:
        return
    expected = f"{parts[0][-2:]}/{parts[1]}"
    if market.widget_season != expected:
        _warn(extra, "market_season_mismatch", "market.widget_season")


def _season_dates(
    player: FutbolFantasyPlayer,
    season: str,
    extra: list[PartialParseWarning],
) -> None:
    for row in player.fixtures:
        if row.date is None:
            continue
        row_season = season_from_slug(row.competition_slug, row.date) or season
        window = season_window(row_season)
        if window is None:
            continue
        start, end = window
        if not _inside(row.date, start, end):
            _warn(extra, "season_window_mismatch", "fixtures.date")
            return


def _inside(value: date, start: date, end: date) -> bool:
    return start <= value <= end
