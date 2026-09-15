"""Leagues and Fantasy upstream response schemas for OpenAPI / Swagger."""

from __future__ import annotations

from typing import Any

from pydantic import Field

from fantasy_api.schemas.common import FlexibleModel


class LeaguesProbeResponse(FlexibleModel):
    """Redacted connectivity probe for Fantasy leagues."""

    ok: bool
    league_count: int = Field(ge=0)
    league_ids: list[Any] = Field(default_factory=list)


class PrizeInformation(FlexibleModel):
    """League prize copy."""

    title: str | None = None
    description: str | None = None


class LeagueType(FlexibleModel):
    """Fantasy league type metadata."""

    id: str | None = None
    canBeDuplicated: bool | None = None
    sponsorId: int | None = None
    prizeInformation: PrizeInformation | None = None


class LeagueFeatures(FlexibleModel):
    """League feature flags."""

    buyoutClause: bool | None = None


class PremiumFeatures(FlexibleModel):
    """Premium feature toggles."""

    formations: bool | None = None
    captain: bool | None = None
    bench: bool | None = None
    loan: bool | None = None
    ideal: bool | None = None
    coach: bool | None = None


class LoanPremiumConfig(FlexibleModel):
    """Loan premium configuration."""

    duration: int | None = None
    maxLoans: int | None = None
    enableConclude: bool | None = None
    minPercentage: float | None = None


class IdealPremiumConfig(FlexibleModel):
    """Ideal lineup premium configuration."""

    reward: int | None = None


class PremiumConfigurations(FlexibleModel):
    """Premium configuration block."""

    loan: LoanPremiumConfig | None = None
    ideal: IdealPremiumConfig | None = None


class LeagueConfig(FlexibleModel):
    """League configuration."""

    features: LeagueFeatures | None = None
    premiumFeatures: PremiumFeatures | None = None
    premiumConfigurations: PremiumConfigurations | None = None


class Manager(FlexibleModel):
    """Manager identity."""

    id: str | None = None
    managerName: str | None = None
    avatar: str | None = None


class LeagueTeamSummary(FlexibleModel):
    """Caller's team summary embedded in a league object."""

    id: int | str | None = None
    money: int | None = None
    teamPoints: int | None = None
    playersNumber: int | None = None
    teamValue: int | None = None
    canPunctuate: bool | None = None
    position: int | None = None
    previousPosition: int | None = None
    isAdmin: bool | None = None


class FantasyLeague(FlexibleModel):
    """Fantasy competition league returned by ``GET /leagues``."""

    id: str | int | None = None
    access: str | None = None
    type: LeagueType | None = None
    managersNumber: int | None = None
    name: str | None = None
    config: LeagueConfig | None = None
    isDuplicated: bool | None = None
    isSecondRound: bool | None = None
    token: str | None = None
    description: str | None = None
    premium: bool | None = None
    team: LeagueTeamSummary | None = None


class StandingTeam(FlexibleModel):
    """Team row nested under standing."""

    id: str | int | None = None
    managerId: int | None = None
    banned: bool | None = None
    managerWarned: bool | None = None
    isAdmin: bool | None = None
    teamValue: int | None = None
    teamPoints: int | None = None
    teamMoney: int | None = None
    manager: Manager | None = None


class StandingRow(FlexibleModel):
    """One standing / ranking row."""

    position: int | None = None
    previousPosition: int | None = None
    points: int | None = None
    livePoints: int | None = None
    team: StandingTeam | None = None
    teamId: str | int | None = None
    name: str | None = None


class ActivityItem(FlexibleModel):
    """One league activity feed item."""

    id: str | int | None = None
    activityTypeId: int | None = None
    amount: int | None = None
    createdAt: str | None = None
    playerMasterId: int | None = None
    user1Id: int | None = None
    user2Id: int | None = None
    weekNumber: int | None = None
    msg: str | None = None
    message: str | None = None
    description: str | None = None


class PlayerMarket(FlexibleModel):
    """Market listing for a player on a team."""

    id: str | None = None
    salePrice: int | None = None
    expirationDate: str | None = None
    numberOfOffers: int | None = None
    directOffer: bool | None = None


class ClubTeam(FlexibleModel):
    """Real-world club metadata on a player."""

    id: str | None = None
    name: str | None = None
    slug: str | None = None
    assets: str | None = None
    badgeColor: str | None = None
    badgeWhite: str | None = None


class PlayerStatWeek(FlexibleModel):
    """Weekly stats block for a player."""

    weekNumber: int | None = None
    totalPoints: int | None = None
    isInIdealFormation: bool | None = None
    stats: dict[str, Any] | None = None


class PlayerMaster(FlexibleModel):
    """Master player card."""

    id: str | None = None
    name: str | None = None
    nickname: str | None = None
    slug: str | None = None
    points: int | None = None
    weekPoints: int | None = None
    marketValue: int | None = None
    positionId: int | None = None
    playerStatus: str | None = None
    teamId: int | None = None
    lastSeasonPoints: int | None = None
    averagePoints: float | int | None = None
    images: dict[str, Any] | None = None
    lastStats: list[PlayerStatWeek] | None = None
    team: ClubTeam | None = None


class SquadPlayer(FlexibleModel):
    """Player slot inside a Fantasy team roster."""

    playerTeamId: str | None = None
    buyoutClause: int | None = None
    buyoutClauseLockedEndTime: str | None = None
    isShielded: bool | None = None
    managerId: int | None = None
    manager: Manager | None = None
    playerMarket: PlayerMarket | None = None
    playerMaster: PlayerMaster | None = None


class LeagueTeam(FlexibleModel):
    """Team / manager entry from ``GET /leagues/{id}/teams``."""

    id: str | int | None = None
    managerId: int | None = None
    banned: bool | None = None
    position: int | None = None
    previousPosition: int | None = None
    fixturePoints: int | None = None
    startingWeek: str | None = None
    teamMoney: int | None = None
    teamPoints: int | None = None
    teamValue: int | None = None
    manager: Manager | None = None
    players: list[SquadPlayer] | None = None
    loanedPlayers: list[Any] | None = None


class TeamDetail(FlexibleModel):
    """Team roster and clauses from ``GET /leagues/{id}/teams/{teamId}``."""

    id: str | int | None = None
    managerId: int | None = None
    banned: bool | None = None
    position: int | None = None
    startingWeek: str | None = None
    teamMoney: int | None = None
    playersNumber: int | None = None
    teamValue: int | None = None
    teamPoints: int | None = None
    manager: Manager | None = None
    players: list[SquadPlayer] | None = None
    loanedPlayers: list[Any] | None = None


def summarize_leagues_payload(data: Any) -> tuple[int, list[Any]]:
    """Extract count and ids from a Fantasy leagues payload.

    Args:
        data: Upstream JSON (list or object wrapping a list).

    Returns:
        Tuple of league count and id list.
    """
    if isinstance(data, list):
        leagues = data
    elif isinstance(data, dict):
        nested = data.get("leagues")
        leagues = nested if isinstance(nested, list) else []
    else:
        leagues = []

    league_ids: list[Any] = []
    for item in leagues:
        if isinstance(item, dict) and "id" in item:
            league_ids.append(item["id"])
    return len(leagues), league_ids
