"""Evaluate armed rules and perform the single write each one was confirmed for."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from fantasy_api.clients.scouting_auth import ScoutingAuthClient
from fantasy_api.domain.errors import NeedsReauthError, NotFoundError, UpstreamError
from fantasy_api.repositories.auto_market import AutoMarketRepository, LiveRule
from fantasy_api.repositories.auto_market_sources import AutoMarketSources
from fantasy_api.repositories.auto_market_writer import AutoMarketWriter
from fantasy_api.schemas.auto_market import AutoRule
from fantasy_api.schemas.leagues import FantasyLeague, TeamDetail
from fantasy_api.schemas.market import MarketListing, MarketSnapshot
from fantasy_api.schemas.players import LeaguePlayer
from fantasy_api.services.auto_market_rules import (
    MAX_SQUAD_PLAYERS,
    accept_floor,
    best_offer,
    bid_amount,
    bid_limit,
    listing_price,
    threshold_reached,
)

CHECK_INTERVAL = timedelta(minutes=5)
LISTED_INTERVAL = timedelta(minutes=1)
INTERRUPTED_AFTER = timedelta(minutes=10)
LISTING_GRACE = timedelta(minutes=10)
UNLOCK_MARGIN = timedelta(seconds=5)
OFFICIAL_LISTING = ("marketPlayerLeague", "market_player")


@dataclass
class PassContext:
    """Reads shared by every rule in one league pass, fetched at most once."""

    bearer: str
    league: str
    membership: FantasyLeague
    now: datetime
    sources: AutoMarketSources
    next_check: datetime
    degraded: bool = False
    _market: MarketSnapshot | None = None
    _team: TeamDetail | None = None
    _cards: dict[str, LeaguePlayer] = field(default_factory=dict)

    @property
    def own_team_id(self) -> str:
        """Return the caller's team id from authenticated membership."""
        assert self.membership.team is not None and self.membership.team.id is not None
        return str(self.membership.team.id)

    @property
    def own_manager(self) -> str | None:
        """Return the caller's manager id when the membership response carries it."""
        team = self.membership.team
        manager = team.manager if team else None
        return str(manager.id) if manager is not None and manager.id is not None else None

    async def market(self) -> MarketSnapshot:
        """Read the market once per pass."""
        if self._market is None:
            self._market = await self.sources.market(self.bearer, self.league)
        return self._market

    async def team(self) -> TeamDetail:
        """Read the caller's roster once per pass."""
        if self._team is None:
            self._team = await self.sources.team(self.bearer, self.league, self.own_team_id)
        return self._team

    async def card(self, player: str) -> LeaguePlayer:
        """Read each player card once per pass."""
        if player not in self._cards:
            self._cards[player] = await self.sources.card(self.bearer, self.league, player)
        return self._cards[player]

    def wake_before(self, moment: datetime) -> None:
        """Schedule the next pass no later than ``moment``."""
        self.next_check = max(self.now + timedelta(seconds=30), min(self.next_check, moment))

    async def owns(self, card: LeaguePlayer, player: str) -> bool:
        """Whether the caller owns the player, falling back to the roster without a manager id."""
        if self.own_manager is not None:
            return self.owner_of(card) == self.own_manager
        roster = (await self.team()).players or []
        return any(slot.player_master and slot.player_master.id == player for slot in roster)

    async def holds_entry(self, card: LeaguePlayer, player: str, entry: str | None) -> bool:
        """Whether ``entry`` is the squad entry of ``player``.

        The league card does not always carry ``playerTeamId``; the roster then confirms it.
        """
        if card.player_team_id is not None:
            return card.player_team_id == entry
        roster = (await self.team()).players or []
        return any(
            slot.player_team_id == entry
            and slot.player_master is not None
            and slot.player_master.id == player
            for slot in roster
        )

    def owner_of(self, card: LeaguePlayer) -> str | None:
        """Return the card's manager id, if the card carries one."""
        manager = card.manager_id or (card.manager.id if card.manager else None)
        return str(manager) if manager is not None else None


def parse_instant(value: str | None) -> datetime | None:
    """Parse an upstream timestamp; a value without a timezone is never trusted."""
    if not value:
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment.astimezone(UTC) if moment.tzinfo else None


class AutoMarketExecutor:
    """Run bounded passes; each rule performs at most one write, claimed before it is sent."""

    def __init__(
        self,
        repository: AutoMarketRepository,
        sources: AutoMarketSources,
        writer: AutoMarketWriter,
        grants: ScoutingAuthClient,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._repository = repository
        self._sources = sources
        self._writer = writer
        self._grants = grants
        self._clock = clock

    async def evaluate(self, owner: str, league: str) -> None:
        """Perform one pass for a due league and store its health."""
        now = self._clock()
        async with self._repository.session(owner) as session:
            state = await session.league(league)
            if not state or state["status"] not in ("active", "degraded"):
                return
            if state["next_check"] > now:
                return
            rules = await session.live_rules(league)
            if not rules or not state["grant_id"]:
                await session.deactivate_if_idle(league)
                return
            grant, failures = state["grant_id"], state["failures"]
        backoff = timedelta(seconds=min(3600, 300 * 2 ** min(failures, 4)))
        context: PassContext | None = None
        try:
            for refresh in (False, True):
                try:
                    context = await self._pass(owner, league, grant, now, refresh)
                    break
                except UpstreamError as exc:
                    if exc.status_code != 401 or refresh:
                        raise
        except NeedsReauthError:
            await self._health(owner, league, "needs_reauth", now, False)
            return
        except UpstreamError as exc:
            if exc.status_code == 401:
                await self._health(owner, league, "needs_reauth", now, False)
            else:
                await self._health(owner, league, "degraded", now + backoff, False)
            return
        except NotFoundError:
            await self._health(owner, league, "not_member", now, False)
            return
        assert context is not None
        status = "degraded" if context.degraded else "active"
        await self._health(owner, league, status, context.next_check, not context.degraded)

    async def _pass(
        self, owner: str, league: str, grant: str, now: datetime, refresh: bool
    ) -> PassContext:
        """Redeem the grant, read the league once and walk every live rule."""
        bearer = await self._grants.redeem(grant, league, retry_unauthorized=refresh)
        membership = await self._sources.membership(bearer, league)
        context = PassContext(bearer, league, membership, now, self._sources, now + CHECK_INTERVAL)
        async with self._repository.session(owner) as session:
            rules = await session.live_rules(league)
        for item in rules:
            await self._rule(owner, item, context)
        return context

    async def _health(
        self, owner: str, league: str, status: str, next_check: datetime, success: bool
    ) -> None:
        async with self._repository.session(owner) as session:
            await session.health(league, status, next_check, success)
            if status == "active":
                await session.deactivate_if_idle(league)

    async def _rule(self, owner: str, item: LiveRule, context: PassContext) -> None:
        """Route one rule; a failure of one rule never blocks the others."""
        rule = item.rule
        if rule.state == "executing":
            if item.claimed_at and context.now - item.claimed_at > INTERRUPTED_AFTER:
                await self._finish(owner, item, "failed", "skip", "failed", "interrupted")
            return
        if rule.state == "armed" and rule.expires_at and rule.expires_at <= context.now:
            await self._finish(owner, item, "expired", "expire", "skipped", "deadline_passed")
            return
        try:
            if rule.side == "sell":
                await self._sell(owner, item, context)
            elif rule.target == "clause":
                await self._buy_clause(owner, item, context)
            else:
                await self._buy_market(owner, item, context)
        except (UpstreamError, NotFoundError) as exc:
            if isinstance(exc, UpstreamError) and exc.status_code in (401, 429):
                raise
            context.degraded = True
            await self._note(owner, item, "skip", "skipped", "snapshot_unavailable")

    # ---- Sell ---- #

    async def _sell(self, owner: str, item: LiveRule, context: PassContext) -> None:
        rule = item.rule
        card = await context.card(rule.player_id)
        owned = await context.owns(card, rule.player_id)
        same_entry = await context.holds_entry(card, rule.player_id, rule.player_team_id)
        if rule.state == "listed":
            await self._listed(owner, item, context, owned and same_entry)
            return
        if not (owned and same_entry):
            await self._finish(owner, item, "failed", "skip", "failed", "left_squad")
            return
        value = card.player_master.market_value if card.player_master else None
        if not value:
            return
        if not rule.list_now and not threshold_reached("sell", rule.threshold_amount, value):
            return
        price = listing_price(rule.threshold_amount, rule.price_mode, value)
        floor = min(price, accept_floor(rule.threshold_amount, rule.price_mode, value))
        assert rule.player_team_id is not None
        if await self._on_market(rule, context):
            await self._already_listed(owner, item, context, price, floor)
            return
        if rule.trigger_kind == "none":
            await self._write(
                owner,
                item,
                context,
                "list",
                price,
                lambda: self._writer.list_player(
                    context.bearer, context.league, rule.player_team_id, price
                ),
                "executed",
                listed_price=price,
            )
            return
        await self._write(
            owner,
            item,
            context,
            "list",
            price,
            lambda: self._writer.list_player(
                context.bearer, context.league, rule.player_team_id, price
            ),
            "listed",
            listed_price=price,
            accept_floor=floor,
        )
        context.wake_before(context.now + LISTED_INTERVAL)

    async def _already_listed(
        self, owner: str, item: LiveRule, context: PassContext, price: int, floor: int
    ) -> None:
        """Adopt a listing the manager already placed: no second listing, offers still sell."""
        if item.rule.trigger_kind == "none":
            await self._finish(owner, item, "executed", "skip", "skipped", "already_listed")
            return

        async def adopt() -> None:
            """No upstream write: the player is already on the market."""

        await self._write(
            owner,
            item,
            context,
            "skip",
            price,
            adopt,
            "listed",
            listed_price=price,
            accept_floor=floor,
        )
        context.wake_before(context.now + LISTED_INTERVAL)

    async def _listed(
        self, owner: str, item: LiveRule, context: PassContext, still_ours: bool
    ) -> None:
        rule = item.rule
        context.wake_before(context.now + LISTED_INTERVAL)
        if not still_ours:
            await self._finish(owner, item, "executed", "skip", "ok", "left_squad")
            return
        assert rule.player_team_id is not None and rule.accept_floor is not None
        offers = await self._sources.offers(context.bearer, context.league, rule.player_team_id)
        offer = best_offer(offers, rule.accept_floor)
        if offer is not None and offer.money is not None:
            await self._write(
                owner,
                item,
                context,
                "accept_offer",
                offer.money,
                lambda: self._writer.accept_offer(
                    context.bearer,
                    context.league,
                    str(offer.market_id),
                    str(offer.id),
                    offer.money or 0,
                ),
                "executed",
            )
            return
        listed_at = rule.listed_at or context.now
        if context.now - listed_at > LISTING_GRACE and not await self._on_market(rule, context):
            await self._relist(owner, item, context)

    async def _relist(self, owner: str, item: LiveRule, context: PassContext) -> None:
        """Put the player back on the market after a listing lapsed without an accepted offer."""
        rule = item.rule
        assert rule.player_team_id is not None
        card = await context.card(rule.player_id)
        value = card.player_master.market_value if card.player_master else None
        if not value:
            return
        price = listing_price(rule.threshold_amount, rule.price_mode, value)
        floor = min(price, accept_floor(rule.threshold_amount, rule.price_mode, value))
        await self._write(
            owner,
            item,
            context,
            "list",
            price,
            lambda: self._writer.list_player(
                context.bearer, context.league, rule.player_team_id, price
            ),
            "listed",
            listed_price=price,
            accept_floor=floor,
        )

    async def _on_market(self, rule: AutoRule, context: PassContext) -> bool:
        """Whether a manager listing of this player is still on the market."""
        market = await context.market()
        return any(
            listing.player_master
            and listing.player_master.id == rule.player_id
            and listing.discr not in OFFICIAL_LISTING
            and listing.direct_offer is not True
            for listing in market.market_players or []
        )

    # ---- Buy ---- #

    async def _buy_market(self, owner: str, item: LiveRule, context: PassContext) -> None:
        rule = item.rule
        assert rule.max_spend is not None
        market = await context.market()
        listings = [
            listing
            for listing in market.market_players or []
            if listing.player_master
            and listing.player_master.id == rule.player_id
            and listing.direct_offer is not True
            and listing.id is not None
        ]
        if any(listing.bid is not None for listing in listings):
            await self._note(owner, item, "skip", "skipped", "already_bid")
            return
        open_listings = [each for each in listings if not self._listing_closed(each, context.now)]
        if not open_listings:
            return
        listing = open_listings[0]
        card = await context.card(rule.player_id)
        if await context.owns(card, rule.player_id):
            await self._finish(owner, item, "failed", "skip", "failed", "already_owned")
            return
        value = (listing.player_master.market_value if listing.player_master else None) or (
            card.player_master.market_value if card.player_master else None
        )
        if not value or not threshold_reached("buy", rule.threshold_amount, value):
            return
        amount = bid_amount(rule.threshold_amount, rule.price_mode, rule.bid_amount, value)
        if amount > rule.max_spend:
            await self._note(owner, item, "skip", "skipped", "over_max_spend", amount)
            return
        team = await context.team()
        active_bids = sum(1 for each in market.market_players or [] if each.bid is not None)
        reason = self._affordable(team, amount, active_bids, bids=True)
        if reason:
            await self._note(owner, item, "skip", "skipped", reason, amount)
            return
        await self._write(
            owner,
            item,
            context,
            "bid",
            amount,
            lambda: self._writer.place_bid(context.bearer, context.league, str(listing.id), amount),
            "executed",
        )

    async def _buy_clause(self, owner: str, item: LiveRule, context: PassContext) -> None:
        rule = item.rule
        assert rule.max_spend is not None and rule.player_team_id is not None
        card = await context.card(rule.player_id)
        if context.owner_of(card) is None:
            return
        if await context.owns(card, rule.player_id):
            await self._finish(owner, item, "failed", "skip", "failed", "already_owned")
            return
        if card.player_team_id != rule.player_team_id:
            await self._finish(owner, item, "failed", "skip", "failed", "ownership_changed")
            return
        value = card.player_master.market_value if card.player_master else None
        if not value or not threshold_reached("buy", rule.threshold_amount, value):
            return
        unlock = parse_instant(card.buyout_clause_locked_end_time)
        if unlock is None:
            await self._note(owner, item, "skip", "skipped", "unlock_unknown")
            return
        if unlock > context.now:
            context.wake_before(unlock + UNLOCK_MARGIN)
            return
        features = context.membership.config.features if context.membership.config else None
        if not (features and features.buyout_clause is True):
            await self._note(owner, item, "skip", "skipped", "clauses_disabled")
            return
        clause = card.buyout_clause or 0
        if clause <= 0:
            await self._note(owner, item, "skip", "skipped", "clause_unknown")
            return
        shielded = card.is_shielded
        if shielded is None:
            shielded = await self._sources.shield(
                context.bearer, context.league, rule.player_team_id
            )
        if shielded is not False:
            await self._note(owner, item, "skip", "skipped", "shield_active_or_unknown", clause)
            return
        if clause > rule.max_spend:
            await self._note(owner, item, "skip", "skipped", "over_max_spend", clause)
            return
        team = await context.team()
        reason = self._affordable(team, clause, 0, bids=False)
        if reason:
            await self._note(owner, item, "skip", "skipped", reason, clause)
            return
        await self._write(
            owner,
            item,
            context,
            "pay_clause",
            clause,
            lambda: self._writer.pay_clause(
                context.bearer, context.league, rule.player_team_id, clause
            ),
            "executed",
        )

    @staticmethod
    def _listing_closed(listing: MarketListing, now: datetime) -> bool:
        expires = parse_instant(listing.expiration_date)
        return expires is not None and expires <= now

    @staticmethod
    def _affordable(team: TeamDetail, amount: int, active_bids: int, *, bids: bool) -> str | None:
        """Return why a spend is not allowed, or ``None`` when cash and squad room allow it."""
        count = team.players_number if team.players_number is not None else len(team.players or [])
        if team.team_money is None or (bids and team.team_value is None):
            return "balance_unavailable"
        if count + active_bids >= MAX_SQUAD_PLAYERS:
            return "squad_full"
        limit = bid_limit(team.team_money, team.team_value or 0) if bids else team.team_money
        return None if amount <= limit else "insufficient_funds"

    # ---- Persistence ---- #

    async def _note(
        self,
        owner: str,
        item: LiveRule,
        action: str,
        outcome: str,
        reason: str,
        amount: int | None = None,
    ) -> None:
        async with self._repository.session(owner) as session:
            await session.note(
                item.rule.id, item.version, action, outcome, amount=amount, reason=reason
            )

    async def _finish(
        self,
        owner: str,
        item: LiveRule,
        state: str,
        action: str,
        outcome: str,
        reason: str,
    ) -> None:
        async with self._repository.session(owner) as session:
            await session.finish(item.rule.id, item.version, state, action, outcome, reason=reason)

    async def _write(
        self,
        owner: str,
        item: LiveRule,
        context: PassContext,
        action: str,
        amount: int,
        call: Callable[[], Awaitable[None]],
        success_state: str,
        *,
        listed_price: int | None = None,
        accept_floor: int | None = None,
    ) -> None:
        """Claim, write once, record. A lost claim, or an unknown result, never retries."""
        rule = item.rule
        async with self._repository.session(owner) as session:
            if not await session.claim(rule.id, rule.state, item.version):
                return
        claimed = item.version + 1
        try:
            await call()
        except (UpstreamError, NeedsReauthError) as exc:
            # 401 and 429 are refused before anything is written, so the claim is handed back.
            definitive = isinstance(exc, NeedsReauthError) or exc.status_code in (401, 429)
            async with self._repository.session(owner) as session:
                if definitive:
                    await session.release(rule.id, rule.state, claimed)
                else:
                    category = getattr(exc, "category", "upstream_error")
                    await session.finish(
                        rule.id, claimed, "failed", action, "failed", amount=amount, reason=category
                    )
            if definitive:
                raise
            return
        except Exception:
            # Anything else leaves the outcome unknown: record it, never retry the write.
            async with self._repository.session(owner) as session:
                await session.finish(
                    rule.id,
                    claimed,
                    "failed",
                    action,
                    "failed",
                    amount=amount,
                    reason="interrupted",
                )
            return
        async with self._repository.session(owner) as session:
            await session.finish(
                rule.id,
                claimed,
                success_state,
                action,
                "ok",
                amount=amount,
                listed_price=listed_price,
                accept_floor=accept_floor,
            )
