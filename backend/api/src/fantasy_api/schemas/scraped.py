"""Tolerant wire models for scraping JSON."""

from __future__ import annotations

from datetime import date as Date

from pydantic import ConfigDict
from pydantic.alias_generators import to_camel

from fantasy_api.schemas.common import (
    FlexibleModel,
    JsonObject,
    JsonValue,
)


class RawScrapedModel(FlexibleModel):
    """Scraper payload model that preserves its camelCase wire keys."""

    model_config = ConfigDict(
        extra="allow",
        alias_generator=to_camel,
        populate_by_name=True,
    )


class RawScrapedMinutes(RawScrapedModel):
    minutes: int | None = None
    minute: int | None = None
    raw: str | None = None
    event: str | None = None


class RawScrapedScore(RawScrapedModel):
    home: int | None = None
    away: int | None = None


class RawScrapedFixtureMatch(RawScrapedModel):
    home_code: str | None = None
    away_code: str | None = None
    home_goals: int | None = None
    away_goals: int | None = None


class RawScrapedStat(RawScrapedModel):
    count: int | float | str | None = None
    points: int | float | str | None = None
    status: str | None = None
    source: str | None = None
    reason: str | None = None


class RawScrapedMatch(RawScrapedModel):
    date: str | None = None
    matchday: int | None = None
    competition: str | None = None
    competition_raw: str | None = None
    kickoff: str | None = None
    is_home: bool | None = None
    player_side: str | None = None
    opponent: str | None = None
    home_team: str | None = None
    away_team: str | None = None
    score: RawScrapedScore | None = None
    minutes: RawScrapedMinutes | int | None = None
    week_points: int | None = None
    fantasy_points: int | None = None
    stats: dict[str, RawScrapedStat] | None = None
    warnings: list[JsonValue] | None = None


class RawScrapedMatches(RawScrapedModel):
    recent: list[RawScrapedMatch] | None = None
    upcoming: list[RawScrapedMatch] | None = None


class RawScrapedFixture(RawScrapedModel):
    date: str | None = None
    matchday: int | None = None
    match: RawScrapedFixtureMatch | None = None
    player_side: str | None = None
    minutes_out: RawScrapedMinutes | int | None = None
    week_points: int | None = None
    dazn_points: int | None = None
    stats: dict[str, RawScrapedStat] | None = None


class RawScrapedProfile(RawScrapedModel):
    injury: JsonValue = None
    availability: JsonObject | None = None
    form: JsonObject | None = None
    start_probability: JsonObject | None = None
    injury_risk: JsonObject | None = None
    injury_history: JsonValue = None
    max_profitable_bid: JsonObject | None = None
    hierarchy: JsonObject | None = None
    news: list[JsonObject] | None = None
    personal: JsonObject | None = None


class RawScrapedDocument(RawScrapedModel):
    """Validated upstream scrape document before normalisation."""

    meta: JsonObject | None = None
    fixtures: list[RawScrapedFixture] | None = None
    matches: RawScrapedMatches | None = None
    profile: RawScrapedProfile | None = None
    market: JsonObject | None = None
    season_stats: JsonObject | None = None
    warnings: list[JsonValue] | None = None


class ScrapedStat(FlexibleModel):
    count: int | None = None
    points: int | None = None


class ScrapedFixture(FlexibleModel):
    date: Date | None = None
    competition: str | None = None
    matchweek: int | None = None
    home_team: str | None = None
    away_team: str | None = None
    home_score: int | None = None
    away_score: int | None = None
    is_home: bool | None = None
    minutes: int | None = None
    fantasy_points: int | None = None
    dazn_points: int | None = None
    stats: dict[str, ScrapedStat] | None = None


class ScrapedMatch(FlexibleModel):
    date: Date | None = None
    kickoff_time: str | None = None
    matchweek: int | None = None
    competition_raw: str | None = None
    is_home: bool | None = None
    opponent: str | None = None
    home_team: str | None = None
    away_team: str | None = None
    home_score: int | None = None
    away_score: int | None = None
    score: str | None = None
    fantasy_points: int | None = None
    minutes: int | None = None
    minutes_note: str | None = None
    minutes_event: str | None = None
    stats: JsonObject | None = None
    warnings: list[JsonValue] | None = None


class ScrapedMatches(FlexibleModel):
    recent: list[ScrapedMatch] | None = None
    upcoming: list[ScrapedMatch] | None = None


class ScrapedProfile(FlexibleModel):
    personal: JsonObject | None = None
    availability: JsonObject | None = None
    form: JsonObject | None = None
    injury: JsonObject | None = None
    injury_history: list[JsonObject] | None = None
    start_probability: JsonObject | None = None
    injury_risk: JsonObject | None = None
    max_profitable_bid: JsonObject | None = None
    hierarchy: JsonObject | None = None
    news: list[JsonObject] | None = None


class FutbolFantasyWire(FlexibleModel):
    meta: JsonObject | None = None
    fixtures: list[ScrapedFixture] | None = None
    matches: ScrapedMatches | None = None
    profile: ScrapedProfile | None = None
    market: JsonObject | None = None
    season_stats: JsonObject | None = None
    warnings: list[JsonValue] | None = None
