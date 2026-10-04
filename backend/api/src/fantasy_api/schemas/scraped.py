"""Tolerant wire models for scraping JSON."""

from __future__ import annotations

from datetime import date as Date
from typing import Any

from fantasy_api.schemas.common import FlexibleModel


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
    score: str | None = None
    minutes: int | None = None
    minutes_note: str | None = None
    stats: dict[str, Any] | None = None
    warnings: list[Any] | None = None


class ScrapedMatches(FlexibleModel):
    recent: list[ScrapedMatch] | None = None
    upcoming: list[ScrapedMatch] | None = None


class ScrapedProfile(FlexibleModel):
    availability: dict[str, Any] | None = None
    injury: dict[str, Any] | None = None
    start_probability: dict[str, Any] | None = None
    injury_risk: dict[str, Any] | None = None
    injury_history: list[dict[str, Any]] | None = None
    max_profitable_bid: dict[str, Any] | None = None
    hierarchy: dict[str, Any] | None = None
    news: list[dict[str, Any]] | None = None


class FutbolFantasyWire(FlexibleModel):
    meta: dict[str, Any] | None = None
    fixtures: list[ScrapedFixture] | None = None
    matches: ScrapedMatches | None = None
    profile: ScrapedProfile | None = None
    market: dict[str, Any] | None = None
    warnings: list[Any] | None = None
