"""FutbolFantasy player tree."""

from datetime import date as Date
from typing import Literal

from pydantic import Field

from fantasy_scraping.parser.models.base import ParserModel
from fantasy_scraping.parser.models.common import (
    Competition,
    CountPercent,
    JsonLdPerson,
    LabeledNumber,
    LabeledValue,
    MinutesNote,
    PageMeta,
    PartialParseWarning,
    Ratio,
    Score,
    SocialLink,
    StatGroup,
)
from fantasy_scraping.parser.models.stats import DaznStats

PositionCode = Literal["POR", "DEF", "MED", "DEL"]
AvailabilityStatus = Literal["available", "doubtful", "injured", "suspended", "unknown"]
RiskLevel = Literal["low", "medium", "high"]
Foot = Literal["left", "right", "both"]
PlayerSide = Literal["home", "away"]


class Identity(ParserModel):
    """Header identity on the player sheet."""

    shirt_number: int | None = None
    display_name: str
    position_code: PositionCode | None = None
    club_badge: str | None = None


class CurrentInjury(ParserModel):
    """Medical state printed in the header. Absent when the header has none."""

    diagnosis: str
    since: Date | None = None
    ongoing: bool = True


class Availability(ParserModel):
    """Published availability label, plus the enum it mapped to."""

    status: AvailabilityStatus
    matchday: int | None = None
    label: str


class Form(ParserModel):
    """Form widget. ``visual_only`` is set when the DOM has no number."""

    value: float | None = None
    visual_only: bool = False


class StartProbability(ParserModel):
    """Chance of starting the next matchday."""

    matchday: int
    percent: int


class InjuryRisk(ParserModel):
    """Published injury-risk label."""

    level: RiskLevel | None = None
    label: str


class Hierarchy(ParserModel):
    """Role in the squad. Unknown labels keep ``rank`` empty."""

    label: str
    rank: int | None = None


class MaxProfitableBid(ParserModel):
    """Maximum bid the page still calls profitable."""

    label: str
    amount: int | None = None
    profitable: bool | None = None


class PersonalInfo(ParserModel):
    """Biographical block. Age is the published number, never recomputed."""

    full_name: str | None = None
    age_years: int | None = None
    birth_date: Date | None = None
    birth_place: str | None = None
    nationalities: list[str] = Field(default_factory=list)
    height_cm: int | None = None
    preferred_foot: Foot | None = None
    contract_end: Date | None = None
    social: list[SocialLink] = Field(default_factory=list)


class PositionInfo(ParserModel):
    """Main position and the demarcation list, in page order."""

    main: str | None = None
    demarcations: list[str] = Field(default_factory=list)
    field_map_available: bool = False


class PlatformRole(ParserModel):
    """Role string published for one fantasy platform."""

    platform: str
    role: str


class BodyZoneCount(ParserModel):
    """One zone on the injury map, copied verbatim."""

    zone: str
    incidents: int


class InjuryEntry(ParserModel):
    """One row of the injury history table."""

    start: Date
    end: Date | None = None
    ongoing: bool = False
    diagnosis: str
    duration_days: int | None = None


class InjuryHistory(ParserModel):
    """Body map plus history. An empty ``entries`` list means the table was empty."""

    body_map: list[BodyZoneCount] = Field(default_factory=list)
    body_map_note: str | None = None
    entries: list[InjuryEntry] = Field(default_factory=list)


class NewsItem(ParserModel):
    """One news link from the player sheet."""

    title: str
    url: str
    published_on: Date | None = None
    source: str | None = None
    summary: str | None = None


class PlayerProfile(ParserModel):
    """Identity, status, biography, injuries and news."""

    identity: Identity
    injury: CurrentInjury | None = None
    availability: Availability | None = None
    form: Form | None = None
    start_probability: StartProbability | None = None
    injury_risk: InjuryRisk | None = None
    hierarchy: Hierarchy | None = None
    max_profitable_bid: MaxProfitableBid | None = None
    personal: PersonalInfo | None = None
    position: PositionInfo | None = None
    platform_roles: list[PlatformRole] = Field(default_factory=list)
    injury_history: InjuryHistory | None = None
    news: list[NewsItem] = Field(default_factory=list)


class RecentMatch(ParserModel):
    """One row of the last-five widget."""

    date: Date
    matchday: int | None = None
    competition: Competition = Competition.OTHER
    competition_raw: str | None = None
    score: Score | None = None
    player_side: PlayerSide | None = None
    minutes: MinutesNote
    stats: DaznStats | None = None
    stats_source: Literal["futbolfantasy"] | None = None


class UpcomingMatch(ParserModel):
    """One row of the next-five widget."""

    date: Date
    matchday: int | None = None
    kickoff: str | None = None
    is_home: bool | None = None
    competition: Competition = Competition.OTHER
    competition_raw: str | None = None


class MatchesBlock(ParserModel):
    """Header calendar widgets, in the order the page printed them."""

    recent: list[RecentMatch] = Field(default_factory=list)
    upcoming: list[UpcomingMatch] = Field(default_factory=list)


class MarketChange(ParserModel):
    """Last published value change."""

    date: Date | None = None
    absolute: int
    percent: float


class MarketExtreme(ParserModel):
    """A max or min taken from the widget text or from a series."""

    value: int
    date: Date | None = None
    derived: bool = False


class MarketMove(ParserModel):
    """One daily market row."""

    date: Date
    change: int
    value: int


class MarketPoint(ParserModel):
    """One point of the market series, when the widget payload is in the HTML."""

    date: Date
    value: int


class MarketBlock(ParserModel):
    """FutbolFantasy market widget. Complementary to the Fantasy API series."""

    current_value: int | None = None
    last_change: MarketChange | None = None
    max_recent: MarketExtreme | None = None
    min_recent: MarketExtreme | None = None
    window_days: int | None = None
    widget_season: str | None = None
    daily_moves: list[MarketMove] = Field(default_factory=list)
    series: list[MarketPoint] | None = None


class Participation(ParserModel):
    """Matches, starts, substitute appearances and minutes."""

    matches_played: int | None = None
    starter: CountPercent | None = None
    substitute: CountPercent | None = None
    minutes: int | None = None


class AttackStats(ParserModel):
    """Attack and chance-creation season totals."""

    goals: int | None = None
    assists: int | None = None
    assists_without_goal: int | None = None
    penalty_goals: int | None = None
    shots_on_target: Ratio | None = None
    goals_per_shot: Ratio | None = None
    woodwork_shots: int | None = None
    clear_chances_created: int | None = None
    clear_chances_missed: int | None = None
    own_goals: int | None = None
    passes: Ratio | None = None
    key_passes: int | None = None
    successful_dribbles: int | None = None
    crosses: Ratio | None = None
    corners_won: int | None = None
    corners_accurate: Ratio | None = None
    free_kicks_accurate: Ratio | None = None
    direct_free_kicks_on_target: Ratio | None = None


class DisciplineStats(ParserModel):
    """Fouls, cards and aerial duels."""

    fouls_received: int | None = None
    fouls_committed: int | None = None
    yellow_cards: int | None = None
    red_cards: int | None = None
    aerial_duels_won: int | None = None


class DefenseStats(ParserModel):
    """Losses, defensive actions and penalties."""

    possessions_lost: int | None = None
    errors_leading_to_goal: int | None = None
    interceptions: int | None = None
    ball_steals: int | None = None
    effective_clearances: int | None = None
    blocked_shots: int | None = None
    last_man_steals: int | None = None
    penalties_scored: Ratio | None = None
    penalties_missed: int | None = None
    penalties_committed: int | None = None
    penalties_won: int | None = None


class GoalkeeperStats(ParserModel):
    """Goalkeeper season block. Present only on goalkeeper pages."""

    saves: int | None = None
    standout_saves: int | None = None
    claimed_crosses: int | None = None
    goals_conceded: int | None = None
    goal_line_saves: int | None = None
    penalties_saved: int | None = None


class SeasonStats(ParserModel):
    """LaLiga season totals. ``derived_fields`` lists totals summed from match cells."""

    view: Literal["totals", "breakdown"] | None = None
    matches_counted: int | None = None
    participation: Participation | None = None
    attack: AttackStats | None = None
    discipline: DisciplineStats | None = None
    defense: DefenseStats | None = None
    goalkeeper: GoalkeeperStats | None = None
    other: list[LabeledValue] = Field(default_factory=list)
    selector_catalog: list[StatGroup] = Field(default_factory=list)
    derived_fields: list[str] = Field(default_factory=list)


class GrossNet(ParserModel):
    """Gross and net fantasy points. A dash on the page is null."""

    gross: float | None = None
    net: float | None = None


class ScoringMode(ParserModel):
    """Another scoring product listed on the page. Its numbers are not read."""

    platform: str
    variants: list[str] = Field(default_factory=list)


class FantasyPoints(ParserModel):
    """Aggregates for LaLiga Fantasy Oficial only."""

    mode: str
    matches_counted: int | None = None
    total: GrossNet
    total_home: GrossNet
    total_away: GrossNet
    average: GrossNet
    average_home: GrossNet
    average_away: GrossNet
    average_last_3: GrossNet
    scoring_modes: list[ScoringMode] = Field(default_factory=list)


class FixtureMatch(ParserModel):
    """Home and away codes and the score line."""

    home_code: str
    away_code: str
    home_goals: int
    away_goals: int


class IconEvent(ParserModel):
    """Decoded icon in the events column."""

    kind: str
    count: int


class EventStat(ParserModel):
    """Count plus optional fantasy points for one event."""

    event: str
    label: str
    count: int
    points: float = 0.0


class EventCount(ParserModel):
    """Event count with no points column."""

    event: str
    label: str
    count: int


class RelevoLayer(ParserModel):
    """DAZN / Relevo breakdown. This is the only non-oficial layer that is read."""

    dazn_points: int
    breakdown: list[LabeledNumber] = Field(default_factory=list)


class FixtureLayers(ParserModel):
    """Expandable match layers that the page actually published."""

    statistical_points: list[EventStat] | None = None
    relevo: RelevoLayer | None = None
    events: list[EventCount] | None = None


class FixtureRow(ParserModel):
    """One LaLiga or competition match row."""

    date: Date | None = None
    matchday: int
    match: FixtureMatch
    player_side: PlayerSide | None = None
    minutes_out: MinutesNote
    stars: int | None = None
    grade: float | None = None
    dazn_points: int | None = None
    week_points: int | None = None
    icon_events: list[IconEvent] = Field(default_factory=list)
    stats: DaznStats
    extra_events: list[EventStat] = Field(default_factory=list)
    layers: FixtureLayers | None = None
    competition: Competition = Competition.LALIGA
    competition_slug: str = ""
    starter: bool = False


class FutbolFantasyPlayer(ParserModel):
    """Hierarchical player document produced from one or more FutbolFantasy pages.

    Attributes:
        schema_version: Output schema id.
        meta: Page identity and versions.
        profile: Biography and status.
        matches: Recent and upcoming widgets.
        market: Market widget, when the HTML contained it.
        season_stats: Season totals for this page's competition.
        fantasy_points: LaLiga Fantasy Oficial aggregates.
        fixtures: Match rows in published order before a merge sorts them.
        missing: Sorted dotted paths the page did not expose.
        warnings: Ordered section warnings.
    """

    schema_version: str = "1"
    meta: PageMeta
    profile: PlayerProfile
    matches: MatchesBlock
    market: MarketBlock | None = None
    season_stats: SeasonStats | None = None
    fantasy_points: FantasyPoints | None = None
    fixtures: list[FixtureRow] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    warnings: list[PartialParseWarning] = Field(default_factory=list)


# Re-export so callers can type JSON-LD from the tree module.
__all__ = ["FutbolFantasyPlayer", "JsonLdPerson"]
