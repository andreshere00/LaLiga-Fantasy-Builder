"""Typed read-only builder snapshot adapter over existing domain services."""

import asyncio
import logging
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ValidationError

from fantasy_api.domain.errors import BuilderError, NotFoundError, UpstreamError
from fantasy_api.domain.lineup_builder.scoring import PlayerEvidence, score_player
from fantasy_api.domain.lineup_builder.target import instant, resolve_target
from fantasy_api.schemas.buyout import ShieldStatus
from fantasy_api.schemas.calendar import CurrentWeek, Fixture
from fantasy_api.schemas.leagues import FantasyLeague, PlayerMaster, SquadPlayer, TeamDetail
from fantasy_api.schemas.lineup_builder import (
    FREE_FORMATIONS,
    PREMIUM_FORMATIONS,
    BuilderDiagnostic,
    BuildPreferences,
    ScoredPlayer,
    TargetWeek,
)
from fantasy_api.schemas.market import MarketBid, MarketListing, MarketSnapshot, PlayerTeamOffers
from fantasy_api.schemas.payload import (
    as_market_snapshot,
    as_object,
    as_object_list,
    as_player_team_offers,
)
from fantasy_api.schemas.player_stats import (
    Competition,
    MarketPreset,
    PlayerDetailQuery,
    WeatherSnapshot,
)
from fantasy_api.schemas.players import CatalogPlayer
from fantasy_api.schemas.standings import ClubStanding
from fantasy_api.schemas.teams import TeamMoney
from fantasy_api.services.buyout import BuyoutService
from fantasy_api.services.calendar import CalendarService
from fantasy_api.services.fixture_standings import FixtureStandingsService
from fantasy_api.services.leagues import LeaguesService
from fantasy_api.services.market import MarketService
from fantasy_api.services.payload import parse_payload
from fantasy_api.services.player_stats import PlayerStatsService
from fantasy_api.services.players import PlayersService
from fantasy_api.services.standings import StandingsService
from fantasy_api.services.teams import TeamsService

logger = logging.getLogger(__name__)


def _financial_error(*codes: str) -> BuilderError:
    """Report only static reason codes; never log cash, credentials or upstream bodies."""
    logger.warning("Lineup builder financial data unavailable (%s)", ", ".join(codes))
    return BuilderError(
        "required financial data is unavailable",
        status_code=503,
        category="financial_data_unavailable",
        diagnostics=[{"code": code, "player_id": None} for code in codes],
    )


class BuilderSnapshot(BaseModel):
    """One internally authorized execution-time snapshot."""

    team_id: str
    target: TargetWeek
    formations: list[str]
    players: list[ScoredPlayer]
    owned: list[ScoredPlayer]
    cash: int
    reserved_squad_slots: int = 0
    diagnostics: list[BuilderDiagnostic]


def _model[T: BaseModel](raw: object, model: type[T]) -> T:
    """Validate provider objects without coercing an unexpected payload to success."""
    data = parse_payload(as_object, raw)
    known = set(model.model_fields) | {f.alias for f in model.model_fields.values() if f.alias}
    if not known.intersection(data):
        raise UpstreamError("provider payload had no recognized fields", category="fantasy_error")
    return parse_payload(model.model_validate, data)


def _models[T: BaseModel](raw: object, model: type[T]) -> list[T]:
    """Validate each row after the shared collection envelope parser."""
    return [_model(row, model) for row in parse_payload(as_object_list, raw)]


def _identity(master: PlayerMaster, source: str, slot: str | None = None) -> ScoredPlayer:
    """Reject incomplete identity/value before computing any financial projection."""
    if (
        not master.id
        or master.market_value is None
        or master.team_id is None
        or master.position_id not in {1, 2, 3, 4}
    ):
        raise ValueError("player identity or valuation unavailable")
    return ScoredPlayer(
        player_id=master.id,
        name=master.nickname or master.name or master.id,
        club_id=master.team_id,
        position=master.position_id,
        source=source,
        player_team_id=slot,
        market_value=master.market_value,
        lineup_score=Decimal(0),
        trading_score=Decimal(0),
        combined_score=Decimal(0),
    )


def _weather_category(snapshot: WeatherSnapshot | None) -> str | None:
    """Map OpenWeather codes to workflow categories without guessing unknown conditions."""
    if snapshot is None:
        return None
    code = snapshot.condition_code
    if code is not None:
        if 200 <= code < 300:
            return "thunderstorm"
        if 300 <= code < 400:
            return "drizzle"
        if 500 <= code < 600:
            return "rain"
        if 600 <= code < 700:
            return "snow"
        return {
            701: "mist",
            741: "mist",
            800: "clear",
            801: "few_clouds",
            802: "scattered_clouds",
            803: "broken_clouds",
            804: "overcast",
        }.get(code)
    category = snapshot.condition.strip().lower().replace(" ", "_")
    category = {"clear_sky": "clear", "overcast_clouds": "overcast"}.get(category, category)
    return (
        category
        if category
        in {
            "clear",
            "few_clouds",
            "scattered_clouds",
            "broken_clouds",
            "overcast",
            "drizzle",
            "rain",
            "shower_rain",
            "thunderstorm",
            "snow",
            "mist",
        }
        else None
    )


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


class LineupBuilderRepository:
    """Assemble verified facts without introducing any new Fantasy route.

    Args:
        leagues: Caller-scoped league and roster reads.
        teams: Current caller cash.
        calendar: Public round/fixture reads.
        market: Market and offer reads.
        stats: Existing segmented stats orchestrator.
        standings: Completed real-club table.
        competition_id: Configured supported competition.
        players: Optional public catalog for missing master-card fields.
        buyout: Optional read-only shield status lookup for sparse opponent rosters.
    """

    def __init__(
        self,
        leagues: LeaguesService,
        teams: TeamsService,
        calendar: CalendarService,
        market: MarketService,
        stats: PlayerStatsService,
        standings: StandingsService | FixtureStandingsService,
        competition_id: int,
        players: PlayersService | None = None,
        buyout: BuyoutService | None = None,
    ) -> None:
        self._leagues = leagues
        self._teams = teams
        self._calendar = calendar
        self._market = market
        self._stats = stats
        self._standings = standings
        self._competition_id = competition_id
        self._players = players
        self._buyout = buyout

    async def snapshot(
        self, jwt: str, league_id: str, preferences: BuildPreferences, now: datetime
    ) -> BuilderSnapshot:
        """Resolve caller ownership first, then gather bounded server-side facts.

        Args:
            jwt: Verified internal JWT, forwarded only to existing services.
            league_id: League to resolve in the caller-scoped membership list.
            preferences: Validated preferences.
            now: Snapshot instant.

        Returns:
            Typed snapshot with eligible players and explicit exclusions.
        """
        leagues = _models(await self._leagues.list_leagues(jwt), FantasyLeague)
        league = next((row for row in leagues if str(row.id) == league_id), None)
        if league is None or league.team is None or league.team.id is None:
            raise NotFoundError("caller league was not found")
        team_id = str(league.team.id)
        formations = list(FREE_FORMATIONS)
        if (
            league.config
            and league.config.premium_features
            and league.config.premium_features.formations is True
        ):
            formations += list(PREMIUM_FORMATIONS)
        if set(preferences.formations) - set(formations):
            raise UpstreamError(
                "formation requires verified entitlement",
                status_code=409,
                category="formation_unavailable",
            )
        raw_team, raw_money, raw_current, raw_market = await asyncio.gather(
            self._leagues.get_team(jwt, league_id, team_id),
            self._teams.get_money(jwt, team_id),
            self._calendar.get_current_week(),
            self._market.get_market(jwt, league_id),
        )
        roster = _model(raw_team, TeamDetail)
        money = _model(raw_money, TeamMoney)
        current = _model(raw_current, CurrentWeek)
        market = parse_payload(
            MarketSnapshot.model_validate, parse_payload(as_market_snapshot, raw_market)
        )
        # teamInvestment has no verified reservation meaning; do not require it to be zero.
        # Only actual bid evidence controls the unresolved-commitments gate.
        finance_reasons: list[str] = []
        if money.team_money is None:
            finance_reasons.append("team_cash_missing")
        # Full market listing snapshots carry caller bids even without userBids.
        if market.market_players is None and market.user_bids is None:
            finance_reasons.append("pending_bid_snapshot_missing")
        bids = {}
        for bid in [
            *(market.user_bids or []),
            *(row.bid for row in market.market_players or [] if row.bid is not None),
        ]:
            nested = (bid.model_extra or {}).get("bid")
            if isinstance(nested, dict):
                bid = _model(nested, MarketBid)
            if bid.id is None or not str(bid.id).strip() or bid.money is None or bid.money <= 0:
                finance_reasons.append("pending_bid_details_missing")
                break
            key = str(bid.id)
            if key in bids and bids[key] != bid.money:
                finance_reasons.append("pending_bid_details_conflict")
                break
            bids[key] = bid.money
        reserved_money = sum(bids.values())
        reserved_slots = len(bids)
        pending_master_ids = {
            row.player_master.id
            for row in market.market_players or []
            if row.bid is not None and row.player_master is not None
        }
        if finance_reasons:
            raise _financial_error(*finance_reasons)
        if roster.players is None:
            raise _financial_error("owned_roster_missing")
        if roster.loaned_players:
            raise _financial_error("loaned_roster_unverified")
        start = current.week_number
        if start is None or not 1 <= start <= 38:
            raise UpstreamError(
                "current round identity is unavailable",
                status_code=503,
                category="target_unavailable",
            )
        rounds = {}
        for week in range(start, min(38, start + 2) + 1):
            rounds[week] = _models(await self._calendar.get_fixtures(week), Fixture)
            if (
                rounds[week]
                and all(instant(f.match_date or f.date) is not None for f in rounds[week])
                and min(instant(f.match_date or f.date) for f in rounds[week]) > now
            ):
                break
        target = resolve_target(current, rounds, now)
        diagnostics: list[BuilderDiagnostic] = []
        if bids:
            diagnostics.append(BuilderDiagnostic(code="cash_conservative_bid_reserve"))
        catalog: dict[str, CatalogPlayer] | None = None
        fantasy_averages: dict[str, Decimal] = {}

        async def complete_master(master: PlayerMaster) -> PlayerMaster:
            """Fill missing public fields for any source by master ID, fetching once."""
            nonlocal catalog
            if master.id and master.average_points is not None:
                average = Decimal(str(master.average_points))
                if average.is_finite():
                    fantasy_averages[master.id] = average
            fields = ("team_id", "position_id", "market_value")
            if (
                self._players is None
                or not master.id
                or all(getattr(master, field) is not None for field in fields)
            ):
                return master
            if catalog is None:
                catalog = {}
                catalog = {
                    str(p.id): p
                    for p in _models(await self._players.list_players(), CatalogPlayer)
                    if p.id is not None
                }
            fallback = catalog.get(master.id)
            if fallback is None:
                return master
            updates = {}
            for field in fields:
                value = getattr(fallback, field)
                if getattr(master, field) is None and value is not None:
                    updates[field] = int(value)
            return master.model_copy(update=updates)

        slots: dict[str, SquadPlayer] = {}
        owned = []
        for slot in roster.players:
            try:
                if slot.player_master is None or not slot.player_team_id:
                    raise ValueError("missing roster identity")
                master = await complete_master(slot.player_master)
                player = _identity(master, "owned", slot.player_team_id)
            except (ValueError, ValidationError):
                raise _financial_error("roster_valuation_unavailable") from None
            owned.append(player)
            slots[player.player_id] = slot
        if len(slots) != len(owned):
            raise UpstreamError("duplicate master identity in roster", category="fantasy_error")
        pool = list(owned) if "owned" in preferences.sources else []
        owned_ids = set(slots)
        if "market" in preferences.sources and preferences.allow_buying:
            for listing in market.market_players or []:
                master = listing.player_master
                expiry = instant(listing.expiration_date)
                if master is None or master.id in owned_ids or master.id in pending_master_ids:
                    continue
                if master.position_id is not None and master.position_id not in {1, 2, 3, 4}:
                    diagnostics.append(
                        BuilderDiagnostic(code="unsupported_player_position", player_id=master.id)
                    )
                    continue
                route_error = _market_route_error(listing, now, target)
                if route_error:
                    diagnostics.append(BuilderDiagnostic(code=route_error, player_id=master.id))
                    continue
                try:
                    player = _identity(await complete_master(master), "market")
                    pool.append(
                        player.model_copy(
                            update={"acquisition_method": "bid", "settlement_at": expiry}
                        )
                    )
                except (ValueError, ValidationError, UpstreamError):
                    diagnostics.append(
                        BuilderDiagnostic(code="player_identity_unavailable", player_id=master.id)
                    )
        if "opponents" in preferences.sources and preferences.allow_buying:
            teams = _models(await self._leagues.list_teams(jwt, league_id), TeamDetail)
            for team in teams:
                if team.id is None or str(team.id) == team_id:
                    continue
                opponent = _model(
                    await self._leagues.get_team(jwt, league_id, str(team.id)), TeamDetail
                )
                for slot in opponent.players or []:
                    master = slot.player_master
                    if master is None or master.id in owned_ids or master.id in pending_master_ids:
                        continue
                    if master.position_id is not None and master.position_id not in {1, 2, 3, 4}:
                        diagnostics.append(
                            BuilderDiagnostic(
                                code="unsupported_player_position", player_id=master.id
                            )
                        )
                        continue
                    lock = instant(slot.buyout_clause_locked_end_time)
                    buyouts = (
                        league.config
                        and league.config.features
                        and league.config.features.buyout_clause is True
                    )
                    route_error = None
                    if buyouts is not True:
                        route_error = (
                            "opponent_buyouts_disabled"
                            if buyouts is False
                            else "opponent_buyout_rules_unknown"
                        )
                    elif lock is None:
                        route_error = "opponent_protection_expiry_unknown"
                    elif lock > target.protection_deadline:
                        route_error = (
                            "opponent_protection_active_at_kickoff"
                            if lock > target.first_kickoff
                            else "opponent_protection_expires_too_late"
                        )
                    elif slot.buyout_clause is None or slot.buyout_clause <= 0:
                        route_error = "opponent_clause_price_missing"
                    shielded = slot.is_shielded
                    if (
                        route_error is None
                        and shielded is None
                        and self._buyout is not None
                        and slot.player_team_id
                    ):
                        try:
                            shield = _model(
                                await self._buyout.check_shield(
                                    jwt, league_id, slot.player_team_id
                                ),
                                ShieldStatus,
                            )
                            shielded = shield.is_shielded
                        except (UpstreamError, NotFoundError):
                            pass
                    if route_error is None:
                        if shielded is True:
                            route_error = "opponent_shield_active"
                        elif shielded is not False:
                            route_error = "opponent_shield_status_unknown"
                    if route_error:
                        diagnostics.append(BuilderDiagnostic(code=route_error, player_id=master.id))
                        continue
                    settlement = max(now, lock)
                    if settlement >= target.clauses_deadline:
                        diagnostics.append(
                            BuilderDiagnostic(
                                code="opponent_acquisition_deadline_closed", player_id=master.id
                            )
                        )
                        continue
                    try:
                        player = _identity(
                            await complete_master(master), "opponents", slot.player_team_id
                        )
                        pool.append(
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
                            BuilderDiagnostic(
                                code="player_identity_unavailable", player_id=master.id
                            )
                        )
        # Prefer owned and direct market identities over duplicate opponent listing paths.
        pool = list({p.player_id: p for p in reversed(pool)}.values())
        if self._players is not None and any(p.player_id not in fantasy_averages for p in pool):
            if catalog is None:
                try:
                    catalog = {
                        str(p.id): p
                        for p in _models(await self._players.list_players(), CatalogPlayer)
                        if p.id is not None
                    }
                except UpstreamError:
                    # Optional scoring evidence must not invalidate verified roster finances.
                    catalog = {}
            for player in pool:
                fallback = catalog.get(player.player_id)
                if player.player_id not in fantasy_averages and fallback is not None:
                    if fallback.average_points is not None:
                        average = Decimal(str(fallback.average_points))
                        if average.is_finite():
                            fantasy_averages[player.player_id] = average
        try:
            table = await self._standings.get_standings(self._competition_id, None, "completed")
            standings = {row.team.id: row for row in table.rows}
        except UpstreamError:
            standings = {}
            diagnostics.append(BuilderDiagnostic(code="standings_unavailable"))
        semaphore = asyncio.Semaphore(4)

        async def evaluate(player: ScoredPlayer) -> ScoredPlayer | None:
            """Apply strict per-player source gates with bounded fan-out."""
            async with semaphore:
                try:
                    return await self._evaluate(
                        player,
                        slots.get(player.player_id),
                        standings,
                        rounds[target.week],
                        target,
                        now,
                        fantasy_averages.get(player.player_id),
                    )
                except (UpstreamError, NotFoundError) as exc:
                    code = (
                        exc.category if isinstance(exc, UpstreamError) else "player_source_missing"
                    )
                    diagnostics.append(BuilderDiagnostic(code=code, player_id=player.player_id))
                    return None

        evaluated = await asyncio.gather(*(evaluate(p) for p in pool))
        eligible = [p for p in evaluated if p is not None]
        score_map = {p.player_id: p for p in eligible if p.source == "owned"}
        # Unscoreable bench still remains in every squad projection, but cannot finance a sale.
        owned = [score_map.get(p.player_id, p) for p in owned]
        if preferences.allow_selling:

            async def sale_route(player: ScoredPlayer) -> ScoredPlayer:
                """Credit only an existing offer with a verified manual acceptance route."""
                async with semaphore:
                    try:
                        offers = parse_payload(
                            PlayerTeamOffers.model_validate,
                            parse_payload(
                                as_player_team_offers,
                                await self._market.get_player_team_offers(
                                    jwt, league_id, player.player_team_id
                                ),
                            ),
                        )
                        if any(
                            offer.status == "pending"
                            and offer.money is not None
                            and offer.money >= player.market_value
                            and instant(offer.expiration_date) is not None
                            and instant(offer.expiration_date) > now
                            for offer in offers.offers or []
                        ):
                            if not player.sections:
                                player = await self._trading_only(
                                    player, slots[player.player_id], target, now
                                )
                            return player.model_copy(update={"sale_settlement_at": now})
                    except (UpstreamError, NotFoundError):
                        diagnostics.append(
                            BuilderDiagnostic(
                                code="sale_route_unavailable", player_id=player.player_id
                            )
                        )
                    return player

            owned = list(await asyncio.gather(*(sale_route(p) for p in owned)))
        return BuilderSnapshot(
            team_id=team_id,
            target=target,
            formations=preferences.formations or formations,
            players=eligible,
            owned=owned,
            cash=money.team_money - reserved_money,
            reserved_squad_slots=reserved_slots,
            diagnostics=diagnostics,
        )

    async def _evaluate(
        self,
        player: ScoredPlayer,
        slot: SquadPlayer | None,
        standings: dict[int, ClubStanding],
        fixtures: list[Fixture],
        target: TargetWeek,
        now: datetime,
        official_average: Decimal | None = None,
    ) -> ScoredPlayer:
        """Join league fixture slots to actual player appearances and current profile."""
        detail = await self._stats.detail(
            player.player_id, PlayerDetailQuery(last=60, preset=MarketPreset.D5)
        )
        market = detail.market
        if (
            market is None
            or market.window.delta_rel is None
            or not market.window.start_value
            or market.window.end_value is None
            or market.window.days != 5
            or len(market.window.series) != 6
            or any(p.filled for p in market.window.series)
        ):
            raise UpstreamError(
                "required five-day market history is unavailable",
                category="market_history_unavailable",
            )
        profile = detail.profile
        if profile is None:
            raise UpstreamError("availability is unavailable", category="availability_unknown")
        availability_source = "futbolfantasy"
        if profile.availability is None:
            availability = {
                "ok": "available",
                "doubtful": "doubtful",
                "injured": "injured",
                "suspended": "suspended",
            }.get(profile.injury.fantasy_status)
            week = None
            availability_source = "fantasy_catalog"
        else:
            availability = profile.availability.get("status")
            week = profile.availability.get("matchday")
        if week is not None and week != target.week:
            raise UpstreamError("availability forecast is stale", category="availability_unknown")
        if availability == "available" and profile.injury.active is not True:
            status = "available"
        elif availability == "doubtful" and profile.injury.active is not True:
            status = "questionable"
        else:
            # The existing derived expected-return date is not a medical timestamp.
            raise UpstreamError("timely recovery is not established", category="player_unavailable")
        club = standings.get(player.club_id)
        if club is None or detail.fixtures is None:
            raise UpstreamError(
                "recent league match slots are unavailable", category="recent_matches_unavailable"
            )
        dates = {match.kickoff_at.date() for match in club.last5_matches}
        played = [
            row
            for row in detail.fixtures.fixtures
            if row.fixture.competition == Competition.LALIGA
            and row.fixture.date in dates
            and row.minutes_played is not None
            and row.minutes_played > 0
        ]
        if not played:
            raise UpstreamError("no recent played league matches", category="no_recent_appearance")
        dazn = [
            Decimal(
                row.stats.dazn_points.dazn_points
                if row.stats.dazn_points.dazn_points is not None
                else row.stats.dazn_points.count
            )
            for row in played
            if row.stats.dazn_points.dazn_points is not None
            or row.stats.dazn_points.count is not None
        ]
        probability = (
            profile.start_probability.percent
            if profile.start_probability.matchweek == target.week
            else None
        )
        target_fixtures = [f for f in fixtures if player.club_id in (f.local_id, f.visitor_id)]
        if len(target_fixtures) != 1:
            raise UpstreamError(
                "target club fixture is ambiguous", category="target_fixture_ambiguous"
            )
        fixture = target_fixtures[0]
        opponent_id = fixture.visitor_id if fixture.local_id == player.club_id else fixture.local_id
        opponent = standings.get(opponent_id)
        upcoming = (
            next(
                (
                    m
                    for m in detail.upcoming.matches
                    if m.fixture.matchweek == target.week
                    and m.fixture.competition == Competition.LALIGA
                ),
                None,
            )
            if detail.upcoming
            else None
        )
        weather = _weather_category(upcoming.weather.snapshot if upcoming else None)
        last_league = max(dates) if dates else None
        midweek_rows = [
            row
            for row in detail.fixtures.fixtures
            if row.fixture.competition
            in {
                Competition.COPA_DEL_REY,
                Competition.SUPERCOPA,
                Competition.CHAMPIONS_LEAGUE,
                Competition.EUROPA_LEAGUE,
                Competition.CONFERENCE_LEAGUE,
            }
            and row.fixture.date
            and last_league
            and last_league < row.fixture.date < target.first_kickoff.date()
        ]
        midweek = max(midweek_rows, key=lambda r: r.fixture.date) if midweek_rows else None
        future_midweek = (
            any(
                m.fixture.competition
                in {
                    Competition.COPA_DEL_REY,
                    Competition.SUPERCOPA,
                    Competition.CHAMPIONS_LEAGUE,
                    Competition.EUROPA_LEAGUE,
                    Competition.CONFERENCE_LEAGUE,
                }
                and m.kickoff
                and now < m.kickoff < target.first_kickoff
                for m in detail.upcoming.matches
            )
            if detail.upcoming
            else False
        )
        expiry = (
            instant(slot.buyout_clause_locked_end_time)
            if slot and slot.is_shielded is False
            else None
        )
        total, matches = profile.fantasy_season_total, profile.fantasy_season_matches
        season_average = (
            Decimal(str(total)) / matches
            if total is not None and matches is not None and matches > 0
            else None
        )
        facts = PlayerEvidence(
            status=status,
            availability_source=availability_source,
            club_position=club.position,
            fantasy_average=season_average if season_average is not None else official_average,
            fantasy_average_source="futbolfantasy" if season_average is not None else "fantasy",
            risk=profile.injury_risk.level.value if profile.injury_risk.raw else None,
            probability=probability,
            role=profile.hierarchy.label,
            form=profile.form.rating if profile.form else None,
            dazn_average=sum(dazn) / len(dazn) if dazn else None,
            market_growth=Decimal(market.window.end_value - market.window.start_value)
            / Decimal(market.window.start_value),
            protection_expiry=expiry,
            club_results=tuple(m.result for m in club.last5_matches),
            midweek=future_midweek or midweek is not None,
            midweek_minutes=midweek.minutes_played if midweek and not future_midweek else None,
            midweek_win=(
                (midweek.fixture.result == "W")
                if midweek and midweek.fixture.result is not None and not future_midweek
                else None
            ),
            weather=weather,
            opponent_position=opponent.position if opponent else None,
            latest_injury=max(
                (
                    row.start
                    for row in profile.injury_history
                    if row.start and profile.injury_history_coverage == "complete"
                ),
                default=None,
            ),
            history_complete=profile.injury_history_coverage == "complete",
        )
        return score_player(
            player.model_copy(update={"news": profile.news}), facts, now, target.first_kickoff
        )

    async def _trading_only(
        self, player: ScoredPlayer, slot: SquadPlayer, target: TargetWeek, now: datetime
    ) -> ScoredPlayer:
        """Score sale candidates independently of their rejected starter eligibility."""
        detail = await self._stats.detail(
            player.player_id, PlayerDetailQuery(preset=MarketPreset.D5, include=["market"])
        )
        market = detail.market
        if (
            market is None
            or not market.window.start_value
            or market.window.end_value is None
            or market.window.days != 5
            or len(market.window.series) != 6
            or any(p.filled for p in market.window.series)
        ):
            raise UpstreamError(
                "sale trading history is unavailable", category="market_history_unavailable"
            )
        facts = PlayerEvidence(
            status="available",
            market_growth=Decimal(market.window.end_value - market.window.start_value)
            / market.window.start_value,
            protection_expiry=(
                instant(slot.buyout_clause_locked_end_time) if slot.is_shielded is False else None
            ),
        )
        scored = score_player(player, facts, now, target.first_kickoff)
        return scored.model_copy(
            update={
                "lineup_score": Decimal(0),
                "combined_score": scored.trading_score,
                "sections": [scored.sections[3]],
                "omissions": ["not_eligible_as_starter"],
            }
        )
