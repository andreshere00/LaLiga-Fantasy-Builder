"""Typed reads that confirm a rule before it is armed; no Fantasy write methods."""

from __future__ import annotations

from dataclasses import dataclass

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.domain.errors import NotFoundError, UpstreamError
from fantasy_api.repositories.buyout import BuyoutRepository
from fantasy_api.repositories.leagues import LeaguesRepository
from fantasy_api.repositories.market import MarketRepository
from fantasy_api.repositories.players import PlayersRepository
from fantasy_api.repositories.scouting_sources import ScoutingSources
from fantasy_api.schemas.buyout import ShieldStatus
from fantasy_api.schemas.leagues import FantasyLeague, TeamDetail
from fantasy_api.schemas.market import MarketOffer, MarketSnapshot, PlayerTeamOffers
from fantasy_api.schemas.payload import (
    as_market_snapshot,
    as_object,
    as_object_list,
    as_player_team_offers,
)
from fantasy_api.schemas.players import LeaguePlayer, PlayerMarketValue
from fantasy_api.services.payload import parse_payload


@dataclass(frozen=True)
class PlayerSnapshot:
    """Identity, ownership and current value of the player a rule is armed for."""

    name: str
    market_value: int
    owner_id: str | None
    player_team_id: str | None


class AutoMarketSources:
    """Reuse the scouting reads; the baseline is the value at the moment of arming."""

    def __init__(
        self, scouting: ScoutingSources, client: LaligaFantasyClient, competition_id: int
    ) -> None:
        self._scouting = scouting
        self._players = PlayersRepository(client, competition_id=competition_id)
        self._leagues = LeaguesRepository(client, competition_id=competition_id)
        self._market = MarketRepository(client, competition_id=competition_id)
        self._buyout = BuyoutRepository(client, competition_id=competition_id)

    async def membership(self, bearer: str, league: str) -> FantasyLeague:
        """Resolve the caller's membership in the requested league."""
        return await self._scouting.membership(bearer, league)

    async def snapshot(self, bearer: str, league: str, player: str) -> PlayerSnapshot:
        """Read the league card and the current market value of one master player."""
        raw = await self._players.get_league_player(bearer, player, league)
        card = parse_payload(LeaguePlayer.model_validate, parse_payload(as_object, raw))
        master = card.player_master
        if master is None or master.id != player:
            raise UpstreamError("player identity mismatch", status_code=502)
        value = master.market_value or await self._latest_value(player)
        if not value or value <= 0:
            raise NotFoundError("player has no market value")
        manager = card.manager_id or (card.manager.id if card.manager else None)
        return PlayerSnapshot(
            name=master.nickname or master.name or player,
            market_value=value,
            owner_id=str(manager) if manager is not None else None,
            player_team_id=card.player_team_id,
        )

    async def _latest_value(self, player: str) -> int | None:
        """Fall back to the newest entry of the public market-value history."""
        rows = parse_payload(as_object_list, await self._players.get_market_value(player))
        entries = [parse_payload(PlayerMarketValue.model_validate, row) for row in rows]
        dated = [entry for entry in entries if entry.date and entry.market_value]
        return max(dated, key=lambda entry: entry.date or "").market_value if dated else None

    async def card(self, bearer: str, league: str, player: str) -> LeaguePlayer:
        """Read the league card of one master player."""
        raw = await self._players.get_league_player(bearer, player, league)
        card = parse_payload(LeaguePlayer.model_validate, parse_payload(as_object, raw))
        if card.player_master is None or card.player_master.id != player:
            raise UpstreamError("player identity mismatch", status_code=502)
        return card

    async def market(self, bearer: str, league: str) -> MarketSnapshot:
        """Read one complete market; missing listing arrays are an upstream failure."""
        raw = parse_payload(as_market_snapshot, await self._market.get_market(bearer, league))
        snapshot = parse_payload(MarketSnapshot.model_validate, raw)
        if snapshot.market_players is None:
            raise UpstreamError("market listings are missing", status_code=502)
        return snapshot

    async def team(self, bearer: str, league: str, team_id: str) -> TeamDetail:
        """Read the caller's roster with cash, squad value and player count."""
        raw = await self._leagues.get_team(bearer, league, team_id)
        return parse_payload(TeamDetail.model_validate, parse_payload(as_object, raw))

    async def offers(self, bearer: str, league: str, entry: str) -> list[MarketOffer]:
        """Read the offers on one of the caller's squad entries."""
        raw = await self._market.get_player_team_offers(bearer, league, entry)
        data = parse_payload(as_player_team_offers, raw)
        return parse_payload(PlayerTeamOffers.model_validate, data).offers or []

    async def shield(self, bearer: str, league: str, entry: str) -> bool | None:
        """Read whether a rival's squad entry is shielded; ``None`` when unconfirmed."""
        raw = await self._buyout.check_shield(bearer, league, entry)
        return parse_payload(ShieldStatus.model_validate, parse_payload(as_object, raw)).is_shielded
