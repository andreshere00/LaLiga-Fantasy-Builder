"""Parsed FutbolFantasy club page and changelog."""

from datetime import date as Date
from datetime import datetime
from typing import Literal

from pydantic import Field

from fantasy_scraping.parser.models.base import ParserModel
from fantasy_scraping.parser.models.common import Competition, PartialParseWarning, Score

ClubOutcome = Literal["win", "draw", "loss"]
ClubRole = Literal["starter", "alternative"]


class ClubCoach(ParserModel):
    """Coach report printed beside the predicted XI."""

    name: str
    photo_url: str | None = None
    matchday: int | None = None
    rotations: str | None = None
    matchday_predictability: str | None = None
    season_predictability_percent: int | None = None
    season_predictability_label: str | None = None


class ClubSquadPlayer(ParserModel):
    """One starter or alternative on the predicted XI."""

    name: str
    role: ClubRole
    profile_url: str | None = None
    photo_url: str | None = None
    probability: int | None = None
    form_arrow: int | None = None
    position: str | None = None


class ClubXiSummary(ParserModel):
    """Published totals under the eleven."""

    average_form_arrow: int | None = None
    average_probability: int | None = None
    substitute_risk: str | None = None


class ClubFixture(ParserModel):
    """One played or upcoming club match."""

    competition: Competition
    competition_label: str
    home: str
    away: str
    home_badge: str | None = None
    away_badge: str | None = None
    round_label: str | None = None
    kickoff: str | None = None
    regulation: Score | None = None
    final: Score | None = None
    outcome: ClubOutcome | None = None
    url: str | None = None
    scheduled: bool = False


class ClubInjury(ParserModel):
    """One current injury card."""

    name: str
    profile_url: str | None = None
    photo_url: str | None = None
    diagnosis: str | None = None
    started_on: Date | None = None
    expected_return: str | None = None
    status: str | None = None
    report_url: str | None = None


class ClubPageDocument(ParserModel):
    """Coach, predicted XI, fixtures, and injuries from one club page."""

    slug: str
    matchday: int | None = None
    coach: ClubCoach | None = None
    starters: list[ClubSquadPlayer] = Field(default_factory=list)
    alternatives: list[ClubSquadPlayer] = Field(default_factory=list)
    summary: ClubXiSummary | None = None
    fixtures: list[ClubFixture] = Field(default_factory=list)
    injuries: list[ClubInjury] | None = None
    warnings: list[PartialParseWarning] = Field(default_factory=list)


ClubNewsKind = Literal["injury_update", "lineup", "call_up", "national_team", "other"]
ClubNewsTarget = Literal["article", "match", "club"]


class ClubNewsItem(ParserModel):
    """One changelog event. The body stays on the source article.

    ``kind`` is the event type from its icon. ``target`` says what ``url`` opens: an article, a
    match page, or only the club page the feed already lives on.
    """

    title: str
    url: str
    published_at: datetime | None = None
    kind: ClubNewsKind = "other"
    target: ClubNewsTarget = "club"


class ClubNewsDocument(ParserModel):
    """Every changelog event published for one club, newest first."""

    slug: str
    items: list[ClubNewsItem] = Field(default_factory=list)
    warnings: list[PartialParseWarning] = Field(default_factory=list)
