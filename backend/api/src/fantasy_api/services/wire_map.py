"""Map camelCase scraping JSON to internal stat structures."""

from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from fantasy_api.domain.competitions import classify_competition
from fantasy_api.schemas.player_stats import (
    Competition,
    FixtureStats,
    InjuryRisk,
    StatKey,
    StatSource,
    default_stat_value,
)
from fantasy_api.schemas.scraped import FutbolFantasyWire, ScrapedStat

MADRID = ZoneInfo("Europe/Madrid")

_PARSER_STAT_KEYS: dict[str, StatKey] = {
    "minutesPlayed": StatKey.MINUTES_PLAYED,
    "goals": StatKey.GOALS,
    "assists": StatKey.ASSISTS,
    "bigChancesCreated": StatKey.BIG_CHANCES_CREATED,
    "ballsIntoBox": StatKey.BALLS_INTO_BOX,
    "penaltiesCommitted": StatKey.PENALTIES_COMMITTED,
    "penaltiesWon": StatKey.PENALTIES_WON,
    "penaltiesSaved": StatKey.PENALTIES_SAVED,
    "saves": StatKey.SAVES,
    "clearances": StatKey.CLEARANCES,
    "penaltiesMissed": StatKey.PENALTIES_MISSED,
    "ownGoals": StatKey.OWN_GOALS,
    "goalsConceded": StatKey.GOALS_CONCEDED,
    "yellowCards": StatKey.YELLOW_CARDS,
    "redCard": StatKey.RED_CARD,
    "shots": StatKey.SHOTS,
    "successfulDribbles": StatKey.SUCCESSFUL_DRIBBLES,
    "ballRecoveries": StatKey.RECOVERIES,
    "ballsLost": StatKey.BALLS_LOST,
    "daznPoints": StatKey.DAZN_POINTS,
}

_FANTASY_WEEK_KEYS: dict[str, StatKey] = {
    "mins_played": StatKey.MINUTES_PLAYED,
    "goals": StatKey.GOALS,
    "goal_assist": StatKey.ASSISTS,
    "pen_area_entries": StatKey.BALLS_INTO_BOX,
    "penalty_conceded": StatKey.PENALTIES_COMMITTED,
    "penalty_save": StatKey.PENALTIES_SAVED,
    "saves": StatKey.SAVES,
    "effective_clearance": StatKey.CLEARANCES,
    "penalty_failed": StatKey.PENALTIES_MISSED,
    "own_goals": StatKey.OWN_GOALS,
    "goals_conceded": StatKey.GOALS_CONCEDED,
    "yellow_card": StatKey.YELLOW_CARDS,
    "red_card": StatKey.RED_CARD,
    "total_scoring_att": StatKey.SHOTS,
    "won_contest": StatKey.SUCCESSFUL_DRIBBLES,
    "ball_recovery": StatKey.RECOVERIES,
    "poss_lost_all": StatKey.BALLS_LOST,
}

_RISK_MAP = {
    "bajo": InjuryRisk.LOW,
    "medio": InjuryRisk.MEDIUM,
    "alto": InjuryRisk.HIGH,
}


def parse_wire_document(raw: Mapping[str, Any]) -> FutbolFantasyWire:
    """Validate tolerant wire models after camelCase normalisation."""
    normalised = _normalise_document(raw)
    return FutbolFantasyWire.model_validate(normalised)


def _normalise_document(raw: Mapping[str, Any]) -> dict[str, Any]:
    matches = raw.get("matches") or {}
    recent = [_normalise_match(row) for row in matches.get("recent") or []]
    upcoming = [_normalise_match(row) for row in matches.get("upcoming") or []]
    fixtures = [_normalise_fixture(row) for row in raw.get("fixtures") or []]
    profile = _normalise_profile(raw.get("profile") or {})
    return {
        "meta": raw.get("meta"),
        "fixtures": fixtures,
        "matches": {"recent": recent, "upcoming": upcoming},
        "profile": profile,
        "market": raw.get("market"),
        "season_stats": raw.get("seasonStats") or raw.get("season_stats"),
        "warnings": raw.get("warnings"),
    }


def _normalise_match(row: Mapping[str, Any]) -> dict[str, Any]:
    minutes = row.get("minutes") or {}
    score = row.get("score") or {}
    home_score: int | None = None
    away_score: int | None = None
    score_text = None
    if isinstance(score, Mapping):
        home_score = _points_int(score.get("home"))
        away_score = _points_int(score.get("away"))
        if home_score is not None and away_score is not None:
            score_text = f"{home_score}-{away_score}"
    return {
        "date": row.get("date"),
        "kickoff_time": row.get("kickoff"),
        "matchweek": row.get("matchday"),
        "competition_raw": row.get("competitionRaw") or row.get("competition"),
        "is_home": _match_is_home(row),
        "opponent": row.get("opponent"),
        "home_team": row.get("homeTeam") or row.get("home_team"),
        "away_team": row.get("awayTeam") or row.get("away_team"),
        "home_score": home_score,
        "away_score": away_score,
        "score": score_text,
        "fantasy_points": _points_int(row.get("weekPoints") or row.get("fantasyPoints")),
        "minutes": minutes.get("minutes") if isinstance(minutes, Mapping) else row.get("minutes"),
        "minutes_note": minutes.get("raw") if isinstance(minutes, Mapping) else None,
        "minutes_event": minutes.get("event") if isinstance(minutes, Mapping) else None,
        "stats": row.get("stats"),
        "warnings": row.get("warnings"),
    }


def _match_is_home(row: Mapping[str, Any]) -> bool | None:
    if "isHome" in row:
        value = row.get("isHome")
        return value if isinstance(value, bool) else None
    side = row.get("playerSide")
    if side is None:
        return None
    return side == "home"


def _normalise_fixture(row: Mapping[str, Any]) -> dict[str, Any]:
    match = row.get("match") or {}
    stats_raw = row.get("stats") or {}
    stats: dict[str, ScrapedStat] = {}
    for key, stat_key in _PARSER_STAT_KEYS.items():
        layer = stats_raw.get(key)
        if isinstance(layer, Mapping):
            stats[stat_key.value] = ScrapedStat(
                count=layer.get("count"),
                points=_points_int(layer.get("points")),
            )
    home = match.get("homeCode") if isinstance(match, Mapping) else None
    away = match.get("awayCode") if isinstance(match, Mapping) else None
    home_score = match.get("homeGoals") if isinstance(match, Mapping) else None
    away_score = match.get("awayGoals") if isinstance(match, Mapping) else None
    minutes_out = row.get("minutesOut")
    minutes: int | None = None
    if isinstance(minutes_out, dict):
        minutes = minutes_out.get("minutes")
    elif isinstance(minutes_out, int):
        minutes = minutes_out
    side = row.get("playerSide")
    is_home = side == "home" if isinstance(side, str) else None
    return {
        "matchweek": row.get("matchday"),
        "home_team": home,
        "away_team": away,
        "home_score": home_score,
        "away_score": away_score,
        "minutes": minutes,
        "fantasy_points": row.get("weekPoints"),
        "dazn_points": row.get("daznPoints"),
        "stats": stats or None,
        "date": row.get("date"),
        "competition": row.get("competition"),
        "is_home": is_home,
    }


def _normalise_profile(raw: Mapping[str, Any]) -> dict[str, Any]:
    history = raw.get("injuryHistory")
    history_list: list[Any] | None = None
    if isinstance(history, list):
        history_list = history
    elif isinstance(history, dict):
        nested = history.get("entries") or history.get("items")
        if isinstance(nested, list):
            history_list = nested
    personal = raw.get("personal")
    return {
        "injury": raw.get("injury"),
        "start_probability": raw.get("startProbability"),
        "injury_risk": raw.get("injuryRisk"),
        "injury_history": history_list,
        "max_profitable_bid": raw.get("maxProfitableBid"),
        "hierarchy": raw.get("hierarchy"),
        "news": raw.get("news"),
        "availability": raw.get("availability"),
        "personal": personal,
    }


def _points_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return int(number)


def stats_from_parser_layer(stats: Mapping[str, Any] | None) -> dict[StatKey, ScrapedStat]:
    """Convert parser camelCase stat block to scraped stats keyed by StatKey."""
    if not stats:
        return {}
    out: dict[StatKey, ScrapedStat] = {}
    for parser_key, stat_key in _PARSER_STAT_KEYS.items():
        layer = stats.get(parser_key)
        if not isinstance(layer, Mapping):
            continue
        count = layer.get("count")
        if layer.get("status") == "implied_zero":
            count = None
        points = _points_int(layer.get("points"))
        if count is None and points is None:
            continue
        out[stat_key] = ScrapedStat(count=count, points=points)
    return out


def stats_from_fantasy_week(stats: Mapping[str, Any] | None) -> dict[StatKey, ScrapedStat]:
    """Map catalog ``lastStats`` week stat arrays to scraped stats."""
    if not stats:
        return {}
    out: dict[StatKey, ScrapedStat] = {}
    for upstream_key, stat_key in _FANTASY_WEEK_KEYS.items():
        raw = stats.get(upstream_key)
        if not isinstance(raw, list) or not raw:
            continue
        if len(raw) not in (1, 2):
            continue
        count: int | None = None
        points: int | None = None
        if len(raw) == 1:
            points = _points_int(raw[0])
        else:
            count = _points_int(raw[0])
            points = _points_int(raw[1])
        out[stat_key] = ScrapedStat(count=count, points=points)
    return out


def fixture_stats_from_layers(
    layers: list[dict[StatKey, ScrapedStat]],
) -> FixtureStats:
    """Build API fixture stats directly from parser/Fantasy layers."""
    from fantasy_api.services.stat_merge import merge_fixture_stats

    merged_layers = [(StatSource.FUTBOLFANTASY, layer) for layer in layers]
    stats, _ = merge_fixture_stats(merged_layers)
    return stats


def competition_from_row(raw: str | None) -> Competition:
    """Classify competition slug or label."""
    if raw and raw in Competition.__members__.values():
        return Competition(raw)
    return classify_competition(raw)


def parse_match_date(value: str | date | None) -> date | None:
    """Parse ISO date from scraper payloads."""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def kickoff_datetime(day: date | None, kickoff: str | None) -> datetime | None:
    """Combine match date and HH:MM kickoff in Europe/Madrid."""
    if day is None or not kickoff:
        return None
    match = re.match(r"^(\d{1,2}):(\d{2})h?$", kickoff.strip())
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2))
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=MADRID)


def map_injury_risk(label: str | None) -> InjuryRisk:
    """Map Spanish risk labels to enums."""
    if not label:
        return InjuryRisk.UNKNOWN
    return _RISK_MAP.get(label.casefold(), InjuryRisk.UNKNOWN)


def empty_fixture_stats() -> FixtureStats:
    """Return a fixture stats object with unavailable defaults."""
    payload = {field: default_stat_value() for field in FixtureStats.model_fields}
    return FixtureStats(**payload)
