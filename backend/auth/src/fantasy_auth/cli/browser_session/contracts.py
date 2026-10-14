"""Independent browser-session API DTOs; shared fixtures enforce parity."""

from __future__ import annotations

from typing import Annotated, Any, ClassVar, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    StrictInt,
    StringConstraints,
    TypeAdapter,
    model_validator,
)
from pydantic.alias_generators import to_camel

JsonObject = dict[str, JsonValue]


class BrowserApiReadModel(BaseModel):
    """Flexible Fantasy response with snake_case Python attributes."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="allow")

    @model_validator(mode="before")
    @classmethod
    def reject_alias_collisions(cls, value: object) -> object:
        """Reject ambiguous declared field aliases."""
        if isinstance(value, dict):
            for name, field in cls.model_fields.items():
                if field.alias and field.alias != name and name in value and field.alias in value:
                    raise ValueError("ambiguous field aliases")
        return value


class BrowserStandingClub(BrowserApiReadModel):
    """Real club identity for the independent standings CLI contract."""

    id: StrictInt = Field(gt=0)
    name: str = Field(min_length=1)
    badge_url: str | None


class BrowserStandingMatch(BrowserApiReadModel):
    """Finalized league result in oldest-first form history."""

    match_id: str = Field(min_length=1)
    kickoff_at: AwareDatetime
    opponent: BrowserStandingClub
    venue: Literal["home", "away"]
    goals_for: StrictInt = Field(ge=0)
    goals_against: StrictInt = Field(ge=0)
    result: Literal["W", "D", "L"]

    @model_validator(mode="after")
    def validate_result(self) -> BrowserStandingMatch:
        """Reject a result inconsistent with its score."""
        expected = (
            "W"
            if self.goals_for > self.goals_against
            else "L" if self.goals_for < self.goals_against else "D"
        )
        if self.result != expected:
            raise ValueError("match result disagrees with score")
        return self


class BrowserClubStanding(BrowserApiReadModel):
    """The eleven required real-club table fields."""

    team: BrowserStandingClub
    position: StrictInt = Field(ge=1)
    points: StrictInt
    played: StrictInt = Field(ge=0)
    won: StrictInt = Field(ge=0)
    drawn: StrictInt = Field(ge=0)
    lost: StrictInt = Field(ge=0)
    goals_for: StrictInt = Field(ge=0)
    goals_against: StrictInt = Field(ge=0)
    goal_difference: StrictInt
    last5_matches: list[BrowserStandingMatch] = Field(max_length=5)

    @model_validator(mode="after")
    def validate_totals(self) -> BrowserClubStanding:
        """Reject incomplete form, mismatched totals, and duplicate results."""
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


class BrowserStandingCompetition(BrowserApiReadModel):
    """Application competition identity."""

    id: StrictInt = Field(gt=0)
    name: str = Field(min_length=1)


class BrowserCompetitionStandings(BrowserApiReadModel):
    """Complete table with explicit provider/cache freshness."""

    competition: BrowserStandingCompetition
    season: StrictInt = Field(ge=2000, le=2100)
    mode: Literal["live", "completed"]
    rows: list[BrowserClubStanding] = Field(min_length=20, max_length=20)
    source: Literal["api-football", "laliga-fixtures"]
    fetched_at: AwareDatetime
    source_updated_at: AwareDatetime | None
    generated_at: AwareDatetime
    cached: bool
    is_provisional: bool
    live_available: Literal[False] = False

    @model_validator(mode="after")
    def validate_table(self) -> BrowserCompetitionStandings:
        """Require unique clubs and a complete ordered sequence of positions."""
        ids = [row.team.id for row in self.rows]
        if len(set(ids)) != len(ids):
            raise ValueError("duplicate club in standings")
        if [row.position for row in self.rows] != list(range(1, len(self.rows) + 1)):
            raise ValueError("standings positions are incomplete or unordered")
        return self


class BrowserLeaguesProbeResponse(BrowserApiReadModel):
    """Redacted connectivity probe for Fantasy leagues."""

    ok: bool
    league_count: int = Field(ge=0)
    league_ids: list[str | int] = Field(default_factory=list)


class BrowserPrizeInformation(BrowserApiReadModel):
    """League prize copy."""

    title: str | None = None
    description: str | None = None


class BrowserLeagueType(BrowserApiReadModel):
    """Fantasy league type metadata."""

    id: str | None = None
    can_be_duplicated: bool | None = None
    sponsor_id: int | None = None
    prize_information: BrowserPrizeInformation | None = None


class BrowserLeagueFeatures(BrowserApiReadModel):
    """League feature flags."""

    buyout_clause: bool | None = None


class BrowserPremiumFeatures(BrowserApiReadModel):
    """Premium feature toggles."""

    formations: bool | None = None
    captain: bool | None = None
    bench: bool | None = None
    loan: bool | None = None
    ideal: bool | None = None
    coach: bool | None = None


class BrowserLoanPremiumConfig(BrowserApiReadModel):
    """Loan premium configuration."""

    duration: int | None = None
    max_loans: int | None = None
    enable_conclude: bool | None = None
    min_percentage: float | None = None


class BrowserIdealPremiumConfig(BrowserApiReadModel):
    """Ideal lineup premium configuration."""

    reward: int | None = None


class BrowserPremiumConfigurations(BrowserApiReadModel):
    """Premium configuration block."""

    loan: BrowserLoanPremiumConfig | None = None
    ideal: BrowserIdealPremiumConfig | None = None


class BrowserLeagueConfig(BrowserApiReadModel):
    """League configuration."""

    features: BrowserLeagueFeatures | None = None
    premium_features: BrowserPremiumFeatures | None = None
    premium_configurations: BrowserPremiumConfigurations | None = None


class BrowserManager(BrowserApiReadModel):
    """BrowserManager identity."""

    id: str | None = None
    manager_name: str | None = None
    avatar: str | None = None
    profile_image: str | None = None


class BrowserLeagueTeamSummary(BrowserApiReadModel):
    """Caller's team summary embedded in a league object."""

    id: int | str | None = None
    money: int | None = None
    team_points: int | None = None
    players_number: int | None = None
    team_value: int | None = None
    can_punctuate: bool | None = None
    position: int | None = None
    previous_position: int | None = None
    is_admin: bool | None = None
    manager: BrowserManager | None = None


class BrowserFantasyLeague(BrowserApiReadModel):
    """Fantasy competition league returned by ``GET /leagues``."""

    id: str | int | None = None
    access: str | None = None
    type: BrowserLeagueType | None = None
    managers_number: int | None = None
    name: str | None = None
    config: BrowserLeagueConfig | None = None
    is_duplicated: bool | None = None
    is_second_round: bool | None = None
    token: str | None = Field(default=None, exclude=True)
    description: str | None = None
    premium: bool | None = None
    team: BrowserLeagueTeamSummary | None = None


class BrowserStandingTeam(BrowserApiReadModel):
    """Team row nested under standing."""

    id: str | int | None = None
    manager_id: int | None = None
    banned: bool | None = None
    manager_warned: bool | None = None
    is_admin: bool | None = None
    team_value: int | None = None
    team_points: int | None = None
    team_money: int | None = None
    avatar: str | None = None
    manager: BrowserManager | None = None


class BrowserStandingRow(BrowserApiReadModel):
    """One standing / ranking row."""

    position: int | None = None
    previous_position: int | None = None
    points: int | None = None
    live_points: int | None = None
    team: BrowserStandingTeam | None = None
    team_id: str | int | None = None
    name: str | None = None


class BrowserActivityItem(BrowserApiReadModel):
    """One league activity feed item."""

    id: str | int | None = None
    activity_type_id: int | None = None
    amount: int | None = None
    created_at: str | None = None
    player_master_id: int | None = None
    user1_id: int | None = None
    user2_id: int | None = None
    week_number: int | None = None
    msg: str | None = None
    message: str | None = None
    description: str | None = None


class BrowserPlayerMarket(BrowserApiReadModel):
    """Market listing for a player on a team."""

    id: str | None = None
    sale_price: int | None = None
    expiration_date: str | None = None
    number_of_offers: int | None = None
    direct_offer: bool | None = None


class BrowserClubTeam(BrowserApiReadModel):
    """Real-world club metadata on a player."""

    id: str | None = None
    name: str | None = None
    slug: str | None = None
    assets: str | None = None
    badge_color: str | None = None
    badge_white: str | None = None


class BrowserPlayerStatWeek(BrowserApiReadModel):
    """Weekly stats block for a player."""

    week_number: int | None = None
    total_points: int | None = None
    is_in_ideal_formation: bool | None = None
    stats: JsonObject | None = None


class BrowserPlayerMaster(BrowserApiReadModel):
    """Master player card."""

    id: str | None = None
    name: str | None = None
    nickname: str | None = None
    slug: str | None = None
    points: int | None = None
    week_points: int | None = None
    market_value: int | None = None
    position_id: int | None = None
    player_status: str | None = None
    team_id: int | None = None
    last_season_points: int | None = None
    average_points: float | int | None = Field(default=None, title="Average points")
    images: JsonObject | None = None
    last_stats: list[BrowserPlayerStatWeek] | None = None
    team: BrowserClubTeam | None = None


class BrowserSquadPlayer(BrowserApiReadModel):
    """Player slot inside a Fantasy team roster."""

    player_team_id: str | None = None
    buyout_clause: int | None = None
    buyout_clause_locked_end_time: str | None = None
    is_shielded: bool | None = None
    manager_id: int | None = None
    manager: BrowserManager | None = None
    player_market: BrowserPlayerMarket | None = None
    player_master: BrowserPlayerMaster | None = None


class BrowserLeagueTeam(BrowserApiReadModel):
    """Team / manager entry from ``GET /leagues/{id}/teams``."""

    id: str | int | None = None
    manager_id: int | None = None
    banned: bool | None = None
    position: int | None = None
    previous_position: int | None = None
    fixture_points: int | None = None
    starting_week: str | None = None
    team_money: int | None = None
    team_points: int | None = None
    team_value: int | None = None
    manager: BrowserManager | None = None
    players: list[BrowserSquadPlayer] | None = None
    loaned_players: list[JsonValue] | None = None


class BrowserTeamDetail(BrowserApiReadModel):
    """Team roster and clauses from ``GET /leagues/{id}/teams/{teamId}``."""

    id: str | int | None = None
    manager_id: int | None = None
    banned: bool | None = None
    position: int | None = None
    starting_week: str | None = None
    team_money: int | None = None
    players_number: int | None = None
    team_value: int | None = None
    team_points: int | None = None
    manager: BrowserManager | None = None
    players: list[BrowserSquadPlayer] | None = None
    loaned_players: list[JsonValue] | None = None


class BrowserTeamMoney(BrowserApiReadModel):
    """Cash and investment from ``GET /teams/{teamId}/money``.

    Rival teams often return empty or sparse objects; fields may be absent.
    """

    empty_payload_allowed: ClassVar[bool] = True

    team_money: int | None = None
    team_investment: int | None = None


class BrowserLineupFormation(BrowserApiReadModel):
    """Formation block nested under a Fantasy lineup response."""

    goalkeeper: list[JsonValue] | None = None
    defender: list[JsonValue] | None = None
    midfield: list[JsonValue] | None = None
    striker: list[JsonValue] | None = None
    coach: list[JsonValue] | None = None
    captain: str | int | None = None
    bench: JsonObject | list[JsonValue] | None = None
    tactical_formation: list[int] | None = None


class BrowserTeamLineup(BrowserApiReadModel):
    """Current or weekly lineup from Fantasy team lineup endpoints."""

    formation: BrowserLineupFormation | None = None
    team_id: str | int | None = None
    week_number: int | None = None


class BrowserMarketBid(BrowserApiReadModel):
    """Bid or offer row nested in a market response."""

    id: str | int | None = None
    money: int | None = None
    status: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class BrowserMarketListing(BrowserApiReadModel):
    """Player listing nested in a market snapshot."""

    id: str | int | None = None
    league_id: str | int | None = None
    league_type: str | int | None = None
    direct_offer: bool | None = None
    discr: str | None = None
    expiration_date: str | None = None
    number_of_bids: int | None = None
    number_of_offers: int | None = None
    bid: BrowserMarketBid | None = None
    player_master: BrowserPlayerMaster | None = None


class BrowserMarketSnapshot(BrowserApiReadModel):
    """Current league market from ``GET /market/leagues/{leagueId}``."""

    market_players: list[BrowserMarketListing] | None = None
    user_bids: list[BrowserMarketBid] | None = None


class BrowserMarketOffer(BrowserApiReadModel):
    """Offer row returned for an owned squad entry."""

    id: str | int | None = None
    money: int | None = None
    status: str | None = None
    bidder_id: str | int | None = None
    created_at: str | None = None


class BrowserMarketHistoryEntry(BrowserApiReadModel):
    """One league market history row."""

    id: str | int | None = None


class BrowserPlayerTeamOffers(BrowserApiReadModel):
    """Offers on an owned squad entry."""

    empty_payload_allowed: ClassVar[bool] = True

    offers: list[BrowserMarketOffer] | None = None
    bids: list[BrowserMarketBid] | None = None


class BrowserMarketMutationResult(BrowserApiReadModel):
    """Response from market write endpoints (may be empty)."""

    empty_payload_allowed: ClassVar[bool] = True
    ok: bool | None = None
    id: str | int | None = None
    status: str | None = None
    message: str | None = None
    market_id: str | int | None = None
    bid_id: str | int | None = None
    offer_id: str | int | None = None
    sold: bool | None = None


class BrowserShieldStatus(BrowserApiReadModel):
    """Shield status from ``GET .../check-shield``."""

    is_shielded: bool | None = None


class BrowserBuyoutMutationResult(BrowserApiReadModel):
    """Response from buyout write endpoints (may be empty)."""

    empty_payload_allowed: ClassVar[bool] = True
    ok: bool | None = None
    message: str | None = None


class BrowserCatalogPlayer(BrowserApiReadModel):
    """Master player entry from ``GET /players``."""

    id: str | int | None = None
    nickname: str | None = None
    name: str | None = None
    slug: str | None = None
    position_id: int | None = None
    team_id: int | Annotated[str, StringConstraints(pattern=r"^[0-9]+$")] | None = None
    team: JsonObject | None = None
    player_status: str | None = None
    points: int | None = None
    average_points: float | int | None = Field(default=None, title="Average points")
    week_points: JsonValue | None = None
    market_value: int | None = None
    last_season_points: int | None = None
    images: JsonObject | None = None
    last_stats: list[JsonValue] | None = None


class BrowserPlayerMarketValue(BrowserApiReadModel):
    """One market-value history entry from ``GET /players/{id}/market-value``."""

    date: str | None = None
    market_value: int | None = None


class BrowserLeaguePlayer(BrowserApiReadModel):
    """Player card contextualized to a league.

    Path identifiers are master ``playerId`` values; the response may include
    the squad-entry ``playerTeamId`` alongside ownership and market blocks.
    """

    player_team_id: str | None = None
    buyout_clause: int | None = None
    buyout_clause_locked_end_time: str | None = None
    is_shielded: bool | None = None
    manager_id: int | str | None = None
    manager: BrowserManager | None = None
    player_market: BrowserPlayerMarket | None = None
    player_master: BrowserPlayerMaster | None = None


class BrowserLineupWrite(BaseModel):
    """Strict full-replacement request body for ``PUT /teams/{id}/lineup``."""

    model_config = ConfigDict(extra="forbid")

    goalkeeper: str | int
    defender: list[str | int]
    midfield: list[str | int]
    striker: list[str | int]
    tactical_formation: list[int]
    coach: str | int | None = None
    captain: str | int | None = None
    bench: dict[str, JsonValue] | None = None


_LIST_LEAGUES = TypeAdapter(list[BrowserFantasyLeague])
_LIST_STANDINGS = TypeAdapter(list[BrowserStandingRow])
_LIST_ACTIVITY = TypeAdapter(list[BrowserActivityItem])
_LIST_TEAMS = TypeAdapter(list[BrowserLeagueTeam])
_LIST_MARKET_HISTORY = TypeAdapter(list[BrowserMarketHistoryEntry])


def response_adapter(method: str, path: str) -> TypeAdapter[Any]:
    """Return the local response contract for one supported browser-session route."""
    segments = [segment for segment in path.split("?")[0].split("/") if segment]
    method = method.upper()
    if (
        method == "POST"
        and len(segments) == 4
        and segments[:2] == ["lineup-builder", "leagues"]
        and segments[3] == "build"
    ):
        from fantasy_auth.cli.browser_session.lineup_builder_contracts import BuildResponse

        return TypeAdapter(BuildResponse)

    if method == "GET" and len(segments) == 3 and segments[0] == "competitions":
        if segments[2] == "standings":
            return TypeAdapter(BrowserCompetitionStandings)

    if method == "GET" and segments == ["leagues"]:
        return _LIST_LEAGUES
    if method == "GET" and len(segments) == 4 and segments[0] == "players":
        if segments[2] == "league":
            return TypeAdapter(BrowserLeaguePlayer)
    if method == "GET" and len(segments) == 3 and segments[0] == "leagues":
        if segments[2] == "standing":
            return _LIST_STANDINGS
        if segments[2] == "teams":
            return _LIST_TEAMS
    if method == "GET" and len(segments) == 4 and segments[0] == "leagues":
        if segments[2] == "standing":
            return _LIST_STANDINGS
        if segments[2] == "activity":
            return _LIST_ACTIVITY
        if segments[2:3] == ["teams"]:
            return TypeAdapter(BrowserTeamDetail)
    if method == "GET" and len(segments) == 3 and segments[:2] == ["teams", segments[1]]:
        if segments[2] == "money":
            return TypeAdapter(BrowserTeamMoney)
        if segments[2] == "lineup":
            return TypeAdapter(BrowserTeamLineup)
    if method == "GET" and len(segments) == 5 and segments[0] == "teams":
        if segments[2:] == ["lineup", "week", segments[4]]:
            return TypeAdapter(BrowserTeamLineup)
    if method == "PUT" and len(segments) == 3 and segments[0] == "teams":
        if segments[2] == "lineup":
            return TypeAdapter(BrowserTeamLineup)
    if method == "GET" and len(segments) == 3 and segments[:2] == ["market", "leagues"]:
        return TypeAdapter(BrowserMarketSnapshot)
    if method == "GET" and len(segments) == 4 and segments[:2] == ["market", "leagues"]:
        if segments[3] == "history":
            return _LIST_MARKET_HISTORY
    if method == "GET" and len(segments) == 6 and segments[:2] == ["market", "leagues"]:
        if segments[3:5] == ["player-teams", segments[4]] and segments[5] == "offers":
            return TypeAdapter(BrowserPlayerTeamOffers)
    if method == "GET" and len(segments) == 6 and segments[:2] == ["buyout", "leagues"]:
        if segments[3:5] == ["player-teams", segments[4]] and segments[5] == "shield":
            return TypeAdapter(BrowserShieldStatus)
    raise ValueError(f"No browser-session response contract for {method} {path}")


def validate_lineup_write(body: object) -> dict[str, object]:
    """Validate and serialize a strict lineup request using API wire names."""
    return BrowserLineupWrite.model_validate(body).model_dump(mode="json", exclude_unset=True)


def require_recognized_response(value: object, *, allow_empty: bool = False) -> None:
    """Reject unrelated root objects while permitting documented empty responses."""
    if isinstance(value, list):
        for item in value:
            require_recognized_response(item)
    elif isinstance(value, BaseModel):
        if allow_empty and not value.model_fields_set:
            return
        if getattr(type(value), "empty_payload_allowed", False) and not value.model_fields_set:
            return
        if not value.model_fields_set.intersection(type(value).model_fields):
            raise ValueError("expected recognized response fields")
