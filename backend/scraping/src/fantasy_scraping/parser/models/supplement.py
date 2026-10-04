"""Caller-supplied Fantasy API and context payloads for player reports."""

from datetime import date as Date

from pydantic import Field

from fantasy_scraping.parser.models.base import ParserModel
from fantasy_scraping.parser.models.futbolfantasy import MarketPoint


class FantasyWeek(ParserModel):
    """One LaLiga Fantasy week from ``lastStats``."""

    week_number: int
    total_points: int
    stats: dict[str, list[int]] = Field(default_factory=dict)


class UpcomingContext(ParserModel):
    """Weather and travel distance for one upcoming fixture date."""

    date: Date
    weather: str | None = None
    distance_km: int | None = None


class FantasySupplement(ParserModel):
    """Optional data the report renderer never fetches itself."""

    weeks: list[FantasyWeek] = Field(default_factory=list)
    market_points: list[MarketPoint] = Field(default_factory=list)
    upcoming: list[UpcomingContext] = Field(default_factory=list)
