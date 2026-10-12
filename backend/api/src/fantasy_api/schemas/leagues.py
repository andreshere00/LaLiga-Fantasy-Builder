"""Leagues and Fantasy upstream response schemas for OpenAPI / Swagger."""

from __future__ import annotations

from typing import Any

from pydantic import Field

from fantasy_api.schemas.common import FantasyWireModel, FlexibleModel, JsonObject, JsonValue
from fantasy_api.schemas.payload import as_object_list


class LeaguesProbeResponse(FlexibleModel):
    """Redacted connectivity probe for Fantasy leagues."""

    ok: bool
    league_count: int = Field(ge=0)
    league_ids: list[str | int] = Field(default_factory=list)


class PrizeInformation(FlexibleModel):
    """League prize copy."""

    title: str | None = None
    description: str | None = None


class LeagueType(FantasyWireModel):
    """Fantasy league type metadata."""

    id: str | None = None
    can_be_duplicated: bool | None = None
    sponsor_id: int | None = None
    prize_information: PrizeInformation | None = None


class LeagueFeatures(FantasyWireModel):
    """League feature flags."""

    buyout_clause: bool | None = None


class PremiumFeatures(FlexibleModel):
    """Premium feature toggles."""

    formations: bool | None = None
    captain: bool | None = None
    bench: bool | None = None
    loan: bool | None = None
    ideal: bool | None = None
    coach: bool | None = None


class LoanPremiumConfig(FantasyWireModel):
    """Loan premium configuration."""

    duration: int | None = None
    max_loans: int | None = None
    enable_conclude: bool | None = None
    min_percentage: float | None = None


class IdealPremiumConfig(FlexibleModel):
    """Ideal lineup premium configuration."""

    reward: int | None = None


class PremiumConfigurations(FlexibleModel):
    """Premium configuration block."""

    loan: LoanPremiumConfig | None = None
    ideal: IdealPremiumConfig | None = None


class LeagueConfig(FantasyWireModel):
    """League configuration."""

    features: LeagueFeatures | None = None
    premium_features: PremiumFeatures | None = None
    premium_configurations: PremiumConfigurations | None = None


class Manager(FantasyWireModel):
    """Manager identity."""

    id: str | None = None
    manager_name: str | None = None
    avatar: str | None = None
    profile_image: str | None = None


class LeagueTeamSummary(FantasyWireModel):
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
    manager: Manager | None = None


class FantasyLeague(FantasyWireModel):
    """Fantasy competition league returned by ``GET /leagues``."""

    id: str | int | None = None
    access: str | None = None
    type: LeagueType | None = None
    managers_number: int | None = None
    name: str | None = None
    config: LeagueConfig | None = None
    is_duplicated: bool | None = None
    is_second_round: bool | None = None
    token: str | None = Field(default=None, exclude=True)
    description: str | None = None
    premium: bool | None = None
    team: LeagueTeamSummary | None = None


class StandingTeam(FantasyWireModel):
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
    manager: Manager | None = None


class StandingRow(FantasyWireModel):
    """One standing / ranking row."""

    position: int | None = None
    previous_position: int | None = None
    points: int | None = None
    live_points: int | None = None
    team: StandingTeam | None = None
    team_id: str | int | None = None
    name: str | None = None


class ActivityItem(FantasyWireModel):
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


class PlayerMarket(FantasyWireModel):
    """Market listing for a player on a team."""

    id: str | None = None
    sale_price: int | None = None
    expiration_date: str | None = None
    number_of_offers: int | None = None
    direct_offer: bool | None = None


class ClubTeam(FantasyWireModel):
    """Real-world club metadata on a player."""

    id: str | None = None
    name: str | None = None
    slug: str | None = None
    assets: str | None = None
    badge_color: str | None = None
    badge_white: str | None = None


class PlayerStatWeek(FantasyWireModel):
    """Weekly stats block for a player."""

    week_number: int | None = None
    total_points: int | None = None
    is_in_ideal_formation: bool | None = None
    stats: JsonObject | None = None


class PlayerMaster(FantasyWireModel):
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
    last_stats: list[PlayerStatWeek] | None = None
    team: ClubTeam | None = None


class SquadPlayer(FantasyWireModel):
    """Player slot inside a Fantasy team roster."""

    player_team_id: str | None = None
    buyout_clause: int | None = None
    buyout_clause_locked_end_time: str | None = None
    is_shielded: bool | None = None
    manager_id: int | None = None
    manager: Manager | None = None
    player_market: PlayerMarket | None = None
    player_master: PlayerMaster | None = None


class LeagueTeam(FantasyWireModel):
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
    manager: Manager | None = None
    players: list[SquadPlayer] | None = None
    loaned_players: list[JsonValue] | None = None


class TeamDetail(FantasyWireModel):
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
    manager: Manager | None = None
    players: list[SquadPlayer] | None = None
    loaned_players: list[JsonValue] | None = None


def summarize_leagues_payload(data: Any) -> tuple[int, list[Any]]:
    """Extract count and ids from a Fantasy leagues payload.

    Args:
        data: Upstream JSON (list or object wrapping a list).

    Returns:
        Tuple of league count and id list.

    Raises:
        ValueError: When the payload is not a collection of objects.
    """
    leagues = as_object_list(data)
    league_ids = [item["id"] for item in leagues if "id" in item]
    return len(leagues), league_ids
