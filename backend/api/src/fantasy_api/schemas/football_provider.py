"""Typed API-Football input models for the standings adapter."""

from typing import Literal

from pydantic import AwareDatetime, Field, StrictInt

from fantasy_api.schemas.common import FlexibleModel


class FootballTeam(FlexibleModel):
    """Provider club identity."""

    id: StrictInt = Field(gt=0)
    name: str = Field(min_length=1)
    logo: str | None = None


class FootballGoals(FlexibleModel):
    """Nonnegative goal totals, including zero before the season starts."""

    scored: StrictInt = Field(alias="for", ge=0)
    against: StrictInt = Field(ge=0)


class FootballRecord(FlexibleModel):
    """Overall club record in a provider standing."""

    played: StrictInt = Field(ge=0)
    win: StrictInt = Field(ge=0)
    draw: StrictInt = Field(ge=0)
    lose: StrictInt = Field(ge=0)
    goals: FootballGoals


class FootballStanding(FlexibleModel):
    """Provider ranking and season totals."""

    rank: StrictInt = Field(ge=1)
    team: FootballTeam
    points: StrictInt
    goals_diff: StrictInt = Field(alias="goalsDiff")
    record: FootballRecord = Field(alias="all")
    update: AwareDatetime | None = None


class FootballStandingLeague(FlexibleModel):
    """Single competition's provider table."""

    id: StrictInt = Field(gt=0)
    name: str = Field(min_length=1)
    country: Literal["Spain"]
    season: StrictInt
    standings: list[list[FootballStanding]] = Field(min_length=1, max_length=1)


class FootballStandingResponse(FlexibleModel):
    """Standing endpoint response row."""

    league: FootballStandingLeague


class FootballSeason(FlexibleModel):
    """Provider season metadata and availability."""

    year: StrictInt = Field(ge=2000, le=2100)
    current: bool


class FootballLeagueIdentity(FlexibleModel):
    """Provider competition identity."""

    id: StrictInt = Field(gt=0)
    name: str = Field(min_length=1)
    type: Literal["League"]


class FootballCountry(FlexibleModel):
    """Provider country constraint for LALIGA."""

    name: Literal["Spain"]


class FootballLeague(FlexibleModel):
    """League discovery response, including its supported seasons."""

    league: FootballLeagueIdentity
    country: FootballCountry
    seasons: list[FootballSeason] = Field(min_length=1)


class FootballRosterEntry(FlexibleModel):
    """Season participant entry from /teams."""

    team: FootballTeam


class FootballStatus(FlexibleModel):
    """Fixture state; only FT results contribute to this domestic league table."""

    short: Literal[
        "TBD",
        "NS",
        "1H",
        "HT",
        "2H",
        "ET",
        "BT",
        "P",
        "SUSP",
        "INT",
        "FT",
        "AET",
        "PEN",
        "PST",
        "CANC",
        "ABD",
        "AWD",
        "WO",
        "LIVE",
    ]


class FootballFixtureIdentity(FlexibleModel):
    """Namespaced match id, kickoff timestamp, and fixture state."""

    id: StrictInt = Field(gt=0)
    date: AwareDatetime
    status: FootballStatus


class FootballFixtureLeague(FlexibleModel):
    """Fixture's competition and season; never infer from the query alone."""

    id: StrictInt = Field(gt=0)
    season: StrictInt


class FootballSides(FlexibleModel):
    """Both clubs involved in a fixture."""

    home: FootballTeam
    away: FootballTeam


class FootballScore(FlexibleModel):
    """Current scores are nullable before kickoff."""

    home: StrictInt | None = Field(ge=0)
    away: StrictInt | None = Field(ge=0)


class FootballFixture(FlexibleModel):
    """One league fixture, excluding extra-time/cup results from normalization."""

    fixture: FootballFixtureIdentity
    league: FootballFixtureLeague
    teams: FootballSides
    goals: FootballScore
