"""Source-specific eligibility checks for lineup builder candidates."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime

from pydantic import ValidationError

from fantasy_api.domain.errors import NotFoundError, UpstreamError
from fantasy_api.domain.lineup_builder.target import instant
from fantasy_api.repositories.lineup_builder_utils import _identity, _model, _models
from fantasy_api.schemas.buyout import ShieldStatus
from fantasy_api.schemas.leagues import FantasyLeague, PlayerMaster, SquadPlayer, TeamDetail
from fantasy_api.schemas.lineup_builder import BuilderDiagnostic, ScoredPlayer, TargetWeek
from fantasy_api.schemas.market import MarketListing, MarketSnapshot
from fantasy_api.services.buyout import BuyoutService
from fantasy_api.services.leagues import LeaguesService


@dataclass(frozen=True, slots=True)
class CandidateSourceContext:
    """Verified facts shared by the market and opponent candidate loaders."""

    jwt: str
    league_id: str
    league: FantasyLeague
    team_id: str
    owned_ids: frozenset[str]
    pending_master_ids: frozenset[str | None]
    target: TargetWeek
    now: datetime
    complete_master: Callable[[PlayerMaster], Awaitable[PlayerMaster]]


@dataclass(slots=True)
class CandidateSourceResult:
    """Candidates and bounded diagnostics from one acquisition source."""

    players: list[ScoredPlayer]
    diagnostics: list[BuilderDiagnostic]


def _market_route_error(listing: MarketListing, now: datetime, target: TargetWeek) -> str | None:
    """Distinguish missing auction evidence from a known missed settlement deadline."""
    metadata = listing.model_extra or {}
    if any(
        metadata.get(field) is not None
        for field in (
            "playerTeam",
            "sellerTeam",
            "seller",
            "manager",
            "playerTeamId",
        )
    ):
        return "market_seller_acceptance_required"
    # directOffer controls seller offers only when an owned squad entry is present.
    # It is not an independent veto for a verified free-player market auction.
    # Current Fantasy league auctions use marketPlayerLeague; market_player is
    # retained for the older captured response. marketPlayerTeam is seller-owned.
    if listing.discr not in {"marketPlayerLeague", "market_player"}:
        return "market_listing_type_unknown"
    expiry = instant(listing.expiration_date)
    if expiry is None:
        return "market_expiry_unknown"
    if expiry <= now:
        return "market_listing_expired"
    if expiry >= target.first_kickoff:
        return "market_settlement_after_kickoff"
    return None


class LineupBuilderSourceLoader:
    """Load source candidates while keeping each acquisition policy together."""

    def __init__(self, leagues: LeaguesService, buyout: BuyoutService | None = None) -> None:
        self._leagues = leagues
        self._buyout = buyout

    async def market_candidates(
        self,
        market: MarketSnapshot,
        context: CandidateSourceContext,
    ) -> CandidateSourceResult:
        """Load eligible free-market candidates and source-specific exclusions."""
        players: list[ScoredPlayer] = []
        diagnostics: list[BuilderDiagnostic] = []
        for listing in market.market_players or []:
            master = listing.player_master
            expiry = instant(listing.expiration_date)
            if (
                master is None
                or master.id in context.owned_ids
                or master.id in context.pending_master_ids
            ):
                continue
            if master.position_id is not None and master.position_id not in {1, 2, 3, 4}:
                diagnostics.append(
                    BuilderDiagnostic(code="unsupported_player_position", player_id=master.id)
                )
                continue
            route_error = _market_route_error(listing, context.now, context.target)
            if route_error:
                diagnostics.append(BuilderDiagnostic(code=route_error, player_id=master.id))
                continue
            try:
                player = _identity(await context.complete_master(master), "market")
                players.append(
                    player.model_copy(update={"acquisition_method": "bid", "settlement_at": expiry})
                )
            except (ValueError, ValidationError, UpstreamError):
                diagnostics.append(
                    BuilderDiagnostic(code="player_identity_unavailable", player_id=master.id)
                )
        return CandidateSourceResult(players, diagnostics)

    async def opponent_candidates(self, context: CandidateSourceContext) -> CandidateSourceResult:
        """Load opponent players only when their clause route is verifiable."""
        players: list[ScoredPlayer] = []
        diagnostics: list[BuilderDiagnostic] = []
        teams = _models(await self._leagues.list_teams(context.jwt, context.league_id), TeamDetail)
        for team in teams:
            if team.id is None or str(team.id) == context.team_id:
                continue
            opponent = _model(
                await self._leagues.get_team(context.jwt, context.league_id, str(team.id)),
                TeamDetail,
            )
            for slot in opponent.players or []:
                master = slot.player_master
                if (
                    master is None
                    or master.id in context.owned_ids
                    or master.id in context.pending_master_ids
                ):
                    continue
                if master.position_id is not None and master.position_id not in {1, 2, 3, 4}:
                    diagnostics.append(
                        BuilderDiagnostic(code="unsupported_player_position", player_id=master.id)
                    )
                    continue
                lock = instant(slot.buyout_clause_locked_end_time)
                route_error = await self._opponent_route_error(context, slot, lock)
                if route_error:
                    diagnostics.append(BuilderDiagnostic(code=route_error, player_id=master.id))
                    continue
                assert lock is not None
                settlement = max(context.now, lock)
                if settlement >= context.target.clauses_deadline:
                    diagnostics.append(
                        BuilderDiagnostic(
                            code="opponent_acquisition_deadline_closed", player_id=master.id
                        )
                    )
                    continue
                try:
                    player = _identity(
                        await context.complete_master(master), "opponents", slot.player_team_id
                    )
                    players.append(
                        player.model_copy(
                            update={
                                "acquisition_method": "clause",
                                "settlement_at": settlement,
                                "clause_price": slot.buyout_clause,
                            }
                        )
                    )
                except (ValueError, ValidationError, UpstreamError):
                    diagnostics.append(
                        BuilderDiagnostic(code="player_identity_unavailable", player_id=master.id)
                    )
        return CandidateSourceResult(players, diagnostics)

    async def _opponent_route_error(
        self,
        context: CandidateSourceContext,
        slot: SquadPlayer,
        lock: datetime | None,
    ) -> str | None:
        """Return why an opponent player's clause route cannot be recommended."""
        features = context.league.config.features if context.league.config else None
        buyouts = features.buyout_clause if features else None
        if buyouts is not True:
            return (
                "opponent_buyouts_disabled" if buyouts is False else "opponent_buyout_rules_unknown"
            )
        if lock is None:
            return "opponent_protection_expiry_unknown"
        if lock > context.target.protection_deadline:
            return (
                "opponent_protection_active_at_kickoff"
                if lock > context.target.first_kickoff
                else "opponent_protection_expires_too_late"
            )
        if slot.buyout_clause is None or slot.buyout_clause <= 0:
            return "opponent_clause_price_missing"

        shielded = slot.is_shielded
        if shielded is None and self._buyout is not None and slot.player_team_id:
            try:
                shield = _model(
                    await self._buyout.check_shield(
                        context.jwt, context.league_id, slot.player_team_id
                    ),
                    ShieldStatus,
                )
                shielded = shield.is_shielded
            except (UpstreamError, NotFoundError):
                pass
        if shielded is True:
            return "opponent_shield_active"
        if shielded is not False:
            return "opponent_shield_status_unknown"
        return None
