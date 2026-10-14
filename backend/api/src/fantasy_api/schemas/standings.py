"""Real-club classification contract, distinct from Fantasy manager standings."""

from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictInt, model_validator

from fantasy_api.schemas.common import FantasyWireModel


class StandingsQuery(BaseModel):
    """Validated season and classification mode for API and CLI callers."""

    model_config = ConfigDict(extra="forbid")

    season: int | None = Field(default=None, ge=2000, le=2100)
    mode: Literal["live", "completed"] = "live"


class StandingClub(FantasyWireModel):
    """Real Fantasy club identity, never a manager's team id."""

    id: StrictInt = Field(gt=0)
    name: str = Field(min_length=1)
    badge_url: str | None


class StandingMatch(FantasyWireModel):
    """One finalized league result, viewed from the classified club."""

    match_id: str = Field(min_length=1)
    kickoff_at: AwareDatetime
    opponent: StandingClub
    venue: Literal["home", "away"]
    goals_for: StrictInt = Field(ge=0)
    goals_against: StrictInt = Field(ge=0)
    result: Literal["W", "D", "L"]

    @model_validator(mode="after")
    def validate_result(self) -> "StandingMatch":
        """Reject a result inconsistent with its score."""
        expected = (
            "W"
            if self.goals_for > self.goals_against
            else "L" if self.goals_for < self.goals_against else "D"
        )
        if self.result != expected:
            raise ValueError("match result disagrees with score")
        return self


class ClubStanding(FantasyWireModel):
    """All eleven required classification fields for a real club."""

    team: StandingClub
    position: StrictInt = Field(ge=1)
    points: StrictInt
    played: StrictInt = Field(ge=0)
    won: StrictInt = Field(ge=0)
    drawn: StrictInt = Field(ge=0)
    lost: StrictInt = Field(ge=0)
    goals_for: StrictInt = Field(ge=0)
    goals_against: StrictInt = Field(ge=0)
    goal_difference: StrictInt
    last5_matches: list[StandingMatch] = Field(max_length=5)

    @model_validator(mode="after")
    def validate_totals(self) -> "ClubStanding":
        """Reject inconsistent totals or incomplete/reordered recent results."""
        if self.played != self.won + self.drawn + self.lost:
            raise ValueError("played total disagrees with results")
        if self.goal_difference != self.goals_for - self.goals_against:
            raise ValueError("goal difference disagrees with goals")
        if len(self.last5_matches) != min(self.played, 5):
            raise ValueError("recent results are incomplete")
        dates = [match.kickoff_at for match in self.last5_matches]
        ids = [match.match_id for match in self.last5_matches]
        if dates != sorted(dates) or len(set(ids)) != len(ids):
            raise ValueError("recent results must be unique and chronological")
        if any(match.opponent.id == self.team.id for match in self.last5_matches):
            raise ValueError("club cannot play itself")
        return self


class StandingCompetition(FantasyWireModel):
    """Application competition identity."""

    id: StrictInt = Field(gt=0)
    name: str = Field(min_length=1)


class CompetitionStandings(FantasyWireModel):
    """Complete standings snapshot with explicit source freshness."""

    competition: StandingCompetition
    season: StrictInt = Field(ge=2000, le=2100)
    mode: Literal["live", "completed"]
    rows: list[ClubStanding] = Field(min_length=20, max_length=20)
    source: Literal["api-football", "laliga-fixtures"]
    fetched_at: AwareDatetime
    source_updated_at: AwareDatetime | None
    generated_at: AwareDatetime
    cached: bool
    is_provisional: bool
    live_available: Literal[False] = False

    @model_validator(mode="after")
    def validate_table(self) -> "CompetitionStandings":
        """Require unique clubs and a complete ordered sequence of positions."""
        ids = [row.team.id for row in self.rows]
        if len(set(ids)) != len(ids):
            raise ValueError("duplicate club in standings")
        if [row.position for row in self.rows] != list(range(1, len(self.rows) + 1)):
            raise ValueError("standings positions are incomplete or unordered")
        return self
