"""Real-club dossier read models."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from fantasy_api.schemas.common import FantasyWireModel

ClubSegmentName = Literal["roster", "performance", "prediction", "injuries", "news"]
CompetitionGroup = Literal["laliga", "european", "domestic", "friendly"]


class ClubModel(BaseModel):
    """Dossier response model. Unknown fields are rejected."""

    model_config = ConfigDict(
        extra="forbid",
        alias_generator=to_camel,
        populate_by_name=True,
    )


class ClubSummary(ClubModel):
    """One current club in the index."""

    club_id: int
    name: str
    short_name: str | None = None
    badge_url: str | None = None
    slug: str | None = None


class ClubIndex(ClubModel):
    """Current clubs with their verified FutbolFantasy slugs."""

    clubs: list[ClubSummary]


class ClubSegmentError(ClubModel):
    """Sanitised reason one dossier section could not be produced."""

    segment: ClubSegmentName
    code: str
    detail: str = Field(max_length=200)


class RosterStatLine(ClubModel):
    """Event counts for one footballer. Missing counts stay null."""

    minutes: int | None = None
    goals: int | None = None
    assists: int | None = None
    dribbles: int | None = None
    penalties_committed: int | None = None
    penalties_saved: int | None = None
    shots: int | None = None
    recoveries: int | None = None
    saves: int | None = None
    balls_lost: int | None = None
    yellow_cards: int | None = None
    red_cards: int | None = None


class RosterPlayer(ClubModel):
    """One footballer in the club squad table."""

    player_id: str
    name: str
    position_id: int | None = None
    points: int | None = None
    stats: RosterStatLine


class RosterMvp(ClubModel):
    """One of the three footballers with the most published season points."""

    player_id: str
    name: str
    points: int
    position_id: int | None = None


class RosterCoverage(ClubModel):
    """How many footballers and matchweeks the totals include."""

    players: int
    matchweeks: list[int]
    short_window: bool


class RosterSection(ClubModel):
    """Squad table, totals, and the three MVP ids."""

    mvps: list[RosterMvp]
    players: list[RosterPlayer]
    totals: RosterStatLine
    coverage: RosterCoverage


class VenueRecord(ClubModel):
    """Wins, draws, and losses at one venue."""

    won: int = 0
    drawn: int = 0
    lost: int = 0


class CompetitionRecord(ClubModel):
    """Results and goals for one competition group."""

    competition: CompetitionGroup
    won: int = 0
    drawn: int = 0
    lost: int = 0
    home: VenueRecord
    away: VenueRecord
    goals_for: int = 0
    goals_against: int = 0


class ClubMatch(ClubModel):
    """One club match. A second score is present only when both were published."""

    match_id: str
    competition: str
    group: CompetitionGroup
    home: str
    away: str
    home_badge: str | None = None
    away_badge: str | None = None
    kickoff: datetime | None = None
    kickoff_text: str | None = None
    round_label: str | None = None
    regulation_home: int | None = None
    regulation_away: int | None = None
    final_home: int | None = None
    final_away: int | None = None
    outcome: Literal["win", "draw", "loss"] | None = None
    venue: Literal["home", "away"] = "home"
    scheduled: bool = False


class PerformanceSection(ClubModel):
    """LaLiga record plus other competitions published on the club page."""

    matches: list[ClubMatch]
    records: list[CompetitionRecord]
    next_match_id: str | None = None


class PredictedPlayer(ClubModel):
    """One starter or alternative in the published XI."""

    name: str
    role: Literal["starter", "alternative"]
    profile_url: str | None = None
    photo_url: str | None = None
    probability: int | None = None
    form_arrow: int | None = None
    position: str | None = None


class PredictedCoach(ClubModel):
    """Coach report for the published matchday."""

    name: str
    photo_url: str | None = None
    matchday: int | None = None
    rotations: str | None = None
    matchday_predictability: str | None = None
    season_predictability_percent: int | None = None
    season_predictability_label: str | None = None


class PredictedSummary(ClubModel):
    """Published XI averages."""

    average_form_arrow: int | None = None
    average_probability: int | None = None
    substitute_risk: str | None = None


class PredictionSection(ClubModel):
    """FutbolFantasy forecast. It is not the lineup saved in Fantasy."""

    matchday: int | None = None
    coach: PredictedCoach | None = None
    starters: list[PredictedPlayer]
    alternatives: list[PredictedPlayer]
    summary: PredictedSummary | None = None


class InjuryItem(ClubModel):
    """One current injury. ``status`` is the published recovery step."""

    name: str
    profile_url: str | None = None
    photo_url: str | None = None
    diagnosis: str | None = None
    started_on: str | None = None
    expected_return: str | None = None
    status: str | None = None


class InjuriesSection(ClubModel):
    """Current injuries. ``published`` is false when the page has no injury block."""

    published: bool
    items: list[InjuryItem]


class NewsItem(ClubModel):
    """One club headline. The article body stays on the source site."""

    title: str
    url: str
    published_at: datetime | None = None


class NewsSection(ClubModel):
    """The five newest club changelog headlines."""

    items: list[NewsItem]


class ClubDossier(ClubModel):
    """One club dossier. Failed sections stay null and are listed in ``segment_errors``."""

    club: ClubSummary
    roster: RosterSection | None = None
    performance: PerformanceSection | None = None
    prediction: PredictionSection | None = None
    injuries: InjuriesSection | None = None
    news: NewsSection | None = None
    segment_errors: list[ClubSegmentError] = Field(default_factory=list)


class ScrapedScore(FantasyWireModel):
    """Goals parsed from a club page."""

    home: int
    away: int


class ScrapedFixture(FantasyWireModel):
    """One fixture from the scraping club document."""

    competition: str
    competition_label: str = ""
    home: str
    away: str
    home_badge: str | None = None
    away_badge: str | None = None
    round_label: str | None = None
    kickoff: str | None = None
    regulation: ScrapedScore | None = None
    final: ScrapedScore | None = None
    outcome: Literal["win", "draw", "loss"] | None = None
    url: str | None = None
    scheduled: bool = False


class ScrapedPlayer(FantasyWireModel):
    """One predicted player from the scraping club document."""

    name: str
    role: Literal["starter", "alternative"]
    profile_url: str | None = None
    photo_url: str | None = None
    probability: int | None = None
    form_arrow: int | None = None
    position: str | None = None


class ScrapedCoach(FantasyWireModel):
    """Coach block from the scraping club document."""

    name: str
    photo_url: str | None = None
    matchday: int | None = None
    rotations: str | None = None
    matchday_predictability: str | None = None
    season_predictability_percent: int | None = None
    season_predictability_label: str | None = None


class ScrapedSummary(FantasyWireModel):
    """XI summary from the scraping club document."""

    average_form_arrow: int | None = None
    average_probability: int | None = None
    substitute_risk: str | None = None


class ScrapedInjury(FantasyWireModel):
    """Injury card from the scraping club document."""

    name: str
    profile_url: str | None = None
    photo_url: str | None = None
    diagnosis: str | None = None
    started_on: str | None = None
    expected_return: str | None = None
    status: str | None = None


class ScrapedClubPage(FantasyWireModel):
    """Club page JSON returned by the scraping service."""

    slug: str
    matchday: int | None = None
    coach: ScrapedCoach | None = None
    starters: list[ScrapedPlayer] = Field(default_factory=list)
    alternatives: list[ScrapedPlayer] = Field(default_factory=list)
    summary: ScrapedSummary | None = None
    fixtures: list[ScrapedFixture] = Field(default_factory=list)
    injuries: list[ScrapedInjury] | None = None


class ScrapedNewsItem(FantasyWireModel):
    """One changelog item from the scraping service."""

    title: str
    url: str
    published_at: datetime | None = None


class ScrapedClubNews(FantasyWireModel):
    """News JSON returned by the scraping service."""

    slug: str
    items: list[ScrapedNewsItem] = Field(default_factory=list)
