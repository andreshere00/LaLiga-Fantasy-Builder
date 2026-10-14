"""Validated official metadata and public Fantasy fixture inputs."""

from pydantic import AwareDatetime, Field, StrictInt

from fantasy_api.schemas.common import FantasyWireModel, FlexibleModel


class OfficialClub(FlexibleModel):
    """Official club identity, resolved against the Fantasy club directory."""

    id: StrictInt = Field(gt=0)
    name: str = Field(min_length=1)


class OfficialStanding(FlexibleModel):
    """Official baseline used to verify fixture completeness and preserve ranking."""

    team: OfficialClub
    position: StrictInt = Field(ge=1, le=20)
    points: StrictInt
    played: StrictInt = Field(ge=0)
    won: StrictInt = Field(ge=0)
    drawn: StrictInt = Field(ge=0)
    lost: StrictInt = Field(ge=0)
    goals_for: StrictInt = Field(ge=0)
    goals_against: StrictInt = Field(ge=0)
    goal_difference: StrictInt


class OfficialStandingsSnapshot(FlexibleModel):
    """Private scraping response; no provider keys or LaLiga bearers."""

    season: StrictInt = Field(ge=2000, le=2100)
    rows: list[OfficialStanding] = Field(min_length=20, max_length=20)
    fetched_at: AwareDatetime


class SeasonFixture(FantasyWireModel):
    """A season fixture; only the verified final state 7 contributes to standings."""

    id: str = Field(pattern=r"^[1-9]\d*$")
    local_id: StrictInt = Field(gt=0)
    visitor_id: StrictInt = Field(gt=0)
    match_state: StrictInt = Field(ge=1)
    match_date: AwareDatetime | None = None
    local_score: StrictInt | None = Field(default=None, ge=0)
    visitor_score: StrictInt | None = Field(default=None, ge=0)
