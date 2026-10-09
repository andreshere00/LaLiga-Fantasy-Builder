"""Player stats segment schemas."""

from __future__ import annotations

from datetime import date as Date
from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

from fantasy_api.schemas.common import FlexibleModel

MAX_WINDOW_DAYS = 400


class Competition(StrEnum):
    LALIGA = "laliga"
    CONFERENCE_LEAGUE = "conference_league"
    EUROPA_LEAGUE = "europa_league"
    CHAMPIONS_LEAGUE = "champions_league"
    COPA_DEL_REY = "copa_del_rey"
    SUPERCOPA = "supercopa"
    OTHER = "other"


class StatSource(StrEnum):
    FANTASY_CATALOG = "fantasy_catalog"
    FANTASY_LEAGUE_CARD = "fantasy_league_card"
    FANTASY_CALENDAR = "fantasy_calendar"
    FUTBOLFANTASY = "futbolfantasy"
    COMPUTED_OFFICIAL = "computed_official"
    DERIVED = "derived"
    UNAVAILABLE = "unavailable"


class StatKey(StrEnum):

    MINUTES_PLAYED = "minutes_played"
    GOALS = "goals"
    ASSISTS = "assists"
    BIG_CHANCES_CREATED = "big_chances_created"
    BALLS_INTO_BOX = "balls_into_box"
    PENALTIES_COMMITTED = "penalties_committed"
    PENALTIES_WON = "penalties_won"
    PENALTIES_SAVED = "penalties_saved"
    SAVES = "saves"
    CLEARANCES = "clearances"
    PENALTIES_MISSED = "penalties_missed"
    OWN_GOALS = "own_goals"
    GOALS_CONCEDED = "goals_conceded"
    YELLOW_CARDS = "yellow_cards"
    RED_CARD = "red_card"
    SHOTS = "shots"
    SUCCESSFUL_DRIBBLES = "successful_dribbles"
    RECOVERIES = "recoveries"
    BALLS_LOST = "balls_lost"
    DAZN_POINTS = "dazn_points"


class MarketPreset(StrEnum):
    SEASON = "season"
    D30 = "30d"
    D14 = "14d"
    D10 = "10d"
    D5 = "5d"


class MatchResult(StrEnum):
    WIN = "W"
    DRAW = "D"
    LOSS = "L"


class InjuryRisk(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    UNKNOWN = "unknown"


class WeatherReason(StrEnum):
    BEYOND_HORIZON = "beyond_forecast_horizon"
    VENUE_UNKNOWN = "venue_unknown"
    KICKOFF_UNKNOWN = "kickoff_unknown"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    DISABLED = "disabled"


class StatsModel(FlexibleModel):
    """Read model base for player stats segments."""


class StrictQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class PlayerRef(StatsModel):
    id: str
    name: str | None = None
    nickname: str | None = None
    slug: str | None = None
    team_id: int | None = None
    team_name: str | None = None
    position_id: int | None = None


class SegmentWarning(StatsModel):
    code: str
    source: str | None = None
    detail: str | None = None

    @field_validator("detail")
    @classmethod
    def _cap_detail(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = "".join(ch for ch in value if ord(ch) >= 32)
        return cleaned[:200] if cleaned else None


class SourceStatus(StatsModel):
    name: str
    status: str = "ok"
    cached: bool = False
    fetched_at: datetime | None = None


class StatValue(StatsModel):
    count: int | None = None
    fantasy_points: int | None = None
    dazn_points: int | None = None
    source: StatSource = StatSource.UNAVAILABLE


def default_stat_value() -> StatValue:
    return StatValue(source=StatSource.UNAVAILABLE)


class FixtureStats(StatsModel):

    minutes_played: StatValue = Field(default_factory=default_stat_value)
    goals: StatValue = Field(default_factory=default_stat_value)
    assists: StatValue = Field(default_factory=default_stat_value)
    big_chances_created: StatValue = Field(default_factory=default_stat_value)
    balls_into_box: StatValue = Field(default_factory=default_stat_value)
    penalties_committed: StatValue = Field(default_factory=default_stat_value)
    penalties_won: StatValue = Field(default_factory=default_stat_value)
    penalties_saved: StatValue = Field(default_factory=default_stat_value)
    saves: StatValue = Field(default_factory=default_stat_value)
    clearances: StatValue = Field(default_factory=default_stat_value)
    penalties_missed: StatValue = Field(default_factory=default_stat_value)
    own_goals: StatValue = Field(default_factory=default_stat_value)
    goals_conceded: StatValue = Field(default_factory=default_stat_value)
    yellow_cards: StatValue = Field(default_factory=default_stat_value)
    red_card: StatValue = Field(default_factory=default_stat_value)
    shots: StatValue = Field(default_factory=default_stat_value)
    successful_dribbles: StatValue = Field(default_factory=default_stat_value)
    recoveries: StatValue = Field(default_factory=default_stat_value)
    balls_lost: StatValue = Field(default_factory=default_stat_value)
    dazn_points: StatValue = Field(default_factory=default_stat_value)


class SegmentEnvelope(StatsModel):
    player_id: str
    player: PlayerRef | None = None
    season: str
    generated_at: datetime
    sources: list[SourceStatus] = Field(default_factory=list)
    warnings: list[SegmentWarning] = Field(default_factory=list)


class FixtureRef(StatsModel):
    date: Date | None = None
    competition: Competition
    competition_label: str | None = None
    matchweek: int | None = None
    home_team: str | None = None
    away_team: str | None = None
    is_home: bool | None = None
    opponent: str | None = None
    home_score: int | None = None
    away_score: int | None = None
    result: MatchResult | None = None


class FixtureStatsRow(StatsModel):
    fixture: FixtureRef
    minutes_played: int | None = None
    fantasy_points_total: int | None = None
    stats: FixtureStats
    warnings: list[SegmentWarning] = Field(default_factory=list)


class PlayerFixtureStatsResponse(SegmentEnvelope):
    fixtures: list[FixtureStatsRow] = Field(default_factory=list)


class MarketSeriesPoint(StatsModel):
    date: Date
    value: int
    delta_abs: int | None = None
    delta_rel: float | None = None
    filled: bool = False


class MarketExtreme(StatsModel):
    date: Date
    value: int


class MarketWindow(StatsModel):
    preset: MarketPreset | None = None
    from_: Date = Field(alias="from")
    to: Date
    days: int
    start_value: int | None = None
    end_value: int | None = None
    delta_abs: int | None = None
    delta_rel: float | None = None
    min: MarketExtreme | None = None
    max: MarketExtreme | None = None
    series: list[MarketSeriesPoint] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class MarketPresetSummary(StatsModel):
    preset: MarketPreset
    from_: Date = Field(alias="from")
    to: Date
    start_value: int | None = None
    end_value: int | None = None
    delta_abs: int | None = None
    delta_rel: float | None = None

    model_config = ConfigDict(populate_by_name=True)


class PlayerMarketResponse(SegmentEnvelope):
    window: MarketWindow
    presets: list[MarketPresetSummary] = Field(default_factory=list)
    current_value: int | None = None
    currency: Literal["EUR"] = "EUR"


class MinutesPlayed(StatsModel):
    minutes: int | None = None
    started: bool | None = None
    note: str | None = None

    @field_validator("note")
    @classmethod
    def _cap_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value[:40]


class RecentMatch(StatsModel):
    fixture: FixtureRef
    minutes: MinutesPlayed
    fantasy_points_total: int | None = None
    stats: FixtureStats | None = None
    warnings: list[SegmentWarning] = Field(default_factory=list)


class RecentMatchesResponse(SegmentEnvelope):
    matches: list[RecentMatch] = Field(default_factory=list)


class Venue(StatsModel):
    club_key: str
    stadium: str | None = None
    city: str | None = None
    lat: float
    lon: float
    country: str | None = None


class Travel(StatsModel):
    distance_km: float | None = None
    mode: Literal["great_circle"] = "great_circle"
    from_venue: Venue | None = Field(default=None, alias="from_venue")
    to_venue: Venue | None = None
    player_team_travels: bool | None = None
    reason: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class WeatherSnapshot(StatsModel):
    temperature_c: float
    feels_like_c: float | None = None
    humidity_pct: int | None = None
    wind_speed_ms: float | None = None
    precipitation_probability: float | None = None
    rain_mm: float | None = None
    condition: str
    condition_code: int | None = None
    icon: str | None = None
    forecast_for: datetime
    granularity: Literal["3h", "daily"] = "3h"
    source: Literal["openweather"] = "openweather"


class MatchWeather(StatsModel):
    snapshot: WeatherSnapshot | None = None
    reason: WeatherReason | None = None
    venue: Venue | None = None


class UpcomingMatch(StatsModel):
    fixture: FixtureRef
    kickoff: datetime | None = None
    weather: MatchWeather
    travel: Travel
    warnings: list[SegmentWarning] = Field(default_factory=list)


class UpcomingMatchesResponse(SegmentEnvelope):
    matches: list[UpcomingMatch] = Field(default_factory=list)


class Injury(StatsModel):
    active: bool | None = None
    diagnosis: str | None = None
    since: Date | None = None
    expected_return: Date | None = None
    availability_text: str | None = None
    fantasy_status: str | None = None


class StartProbability(StatsModel):
    matchweek: int | None = None
    percent: int | None = None
    raw: str | None = None


class InjuryRiskInfo(StatsModel):
    level: InjuryRisk
    raw: str | None = None


class InjuryHistoryEntry(StatsModel):
    start: Date | None = None
    end: Date | None = None
    ongoing: bool = False
    diagnosis: str | None = None
    duration_days: int | None = None


class MaxProfitableBid(StatsModel):
    amount: int | None = None
    profitable: bool | None = None
    raw: str | None = None


class Hierarchy(StatsModel):
    label: str | None = None
    rank: int | None = None


class AveragePerMatch(StatsModel):
    """One published per-match average from the scraped season block."""

    code: str
    label: str
    value: float | None = None


class NewsItem(StatsModel):
    title: str
    url: HttpUrl | None = None
    published_at: datetime | None = None
    source: str | None = None

    @field_validator("title")
    @classmethod
    def _cap_title(cls, value: str) -> str:
        return value[:200]


class PlayerProfileResponse(SegmentEnvelope):
    injury: Injury
    start_probability: StartProbability
    injury_risk: InjuryRiskInfo
    injury_history: list[InjuryHistoryEntry] = Field(default_factory=list)
    max_profitable_bid: MaxProfitableBid
    hierarchy: Hierarchy
    news: list[NewsItem] = Field(default_factory=list)
    averages: list[AveragePerMatch] = Field(default_factory=list)


class SegmentDescriptor(StatsModel):
    name: str
    href: str
    auth: Literal["jwt", "public"]
    sources: list[str]
    requires_scraper: bool
    available: bool
    query: list[str]


class PlayerStatsIndex(StatsModel):
    player: PlayerRef
    season: str
    segments: list[SegmentDescriptor] = Field(default_factory=list)
    generated_at: datetime


class FixturesQuery(StrictQuery):
    competition: list[Competition] | None = None
    last: int = Field(10, ge=1, le=60)


class MarketQuery(StrictQuery):
    preset: MarketPreset | None = None
    from_: Date | None = Field(None, alias="from")
    to: Date | None = None

    @model_validator(mode="after")
    def _valiDate_window(self) -> MarketQuery:
        preset = self.preset
        from_ = self.from_
        to = self.to
        if preset is not None and (from_ is not None or to is not None):
            raise ValueError("preset is exclusive with from/to")
        if to is not None and from_ is None:
            raise ValueError("from is required when to is set")
        if from_ is not None and to is not None and from_ > to:
            raise ValueError("from must be on or before to")
        if from_ is not None and to is not None:
            if (to - from_).days > MAX_WINDOW_DAYS:
                raise ValueError("window span exceeds maximum")
        return self


class RecentMatchesQuery(StrictQuery):
    limit: int = Field(5, ge=1, le=5)
    include_stats: bool = True


class UpcomingMatchesQuery(StrictQuery):
    limit: int = Field(5, ge=1, le=5)
    include_weather: bool = True


class ProfileQuery(StrictQuery):
    pass


DetailSegment = Literal["fixtures", "market", "recent", "upcoming", "profile"]

_DETAIL_SEGMENTS: frozenset[str] = frozenset(
    {"fixtures", "market", "recent", "upcoming", "profile"},
)


def default_detail_include() -> list[DetailSegment]:
    return ["fixtures", "market", "recent", "upcoming", "profile"]


class PlayerDetailQuery(StrictQuery):
    last: int = Field(5, ge=1, le=60)
    competition: list[Competition] | None = None
    preset: MarketPreset | None = None
    from_: Date | None = Field(None, alias="from")
    to: Date | None = None
    limit: int = Field(5, ge=1, le=5)
    include_stats: bool = True
    include_weather: bool = True
    include: list[DetailSegment] = Field(default_factory=default_detail_include)

    @model_validator(mode="after")
    def _validate_detail(self) -> PlayerDetailQuery:
        unknown = set(self.include) - _DETAIL_SEGMENTS
        if unknown:
            raise ValueError("unknown include segment")
        MarketQuery(
            preset=self._effective_market_preset(),
            from_=self.from_,
            to=self.to,
        )
        return self

    def _effective_market_preset(self) -> MarketPreset | None:
        if self.from_ is not None or self.to is not None:
            return self.preset
        return self.preset if self.preset is not None else MarketPreset.SEASON

    def market_query(self) -> MarketQuery:
        return MarketQuery(
            preset=self._effective_market_preset(),
            from_=self.from_,
            to=self.to,
        )

    def fixtures_query(self) -> FixturesQuery:
        return FixturesQuery(competition=self.competition, last=self.last)

    def recent_query(self) -> RecentMatchesQuery:
        return RecentMatchesQuery(limit=self.limit, include_stats=self.include_stats)

    def upcoming_query(self) -> UpcomingMatchesQuery:
        return UpcomingMatchesQuery(limit=self.limit, include_weather=self.include_weather)


class SegmentError(StatsModel):
    segment: DetailSegment
    code: str
    detail: str

    @field_validator("detail")
    @classmethod
    def _cap_detail(cls, value: str) -> str:
        cleaned = "".join(ch for ch in value if ord(ch) >= 32)
        return cleaned[:200] if cleaned else ""


class PlayerDetailResponse(StatsModel):
    player_id: str
    player: PlayerRef
    season: str
    generated_at: datetime
    fixtures: PlayerFixtureStatsResponse | None = None
    market: PlayerMarketResponse | None = None
    recent: RecentMatchesResponse | None = None
    upcoming: UpcomingMatchesResponse | None = None
    profile: PlayerProfileResponse | None = None
    segment_errors: list[SegmentError] = Field(default_factory=list)
