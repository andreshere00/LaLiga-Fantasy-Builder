"""Read-only, typed Fantasy snapshots for a single delegated league."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.domain.errors import NotFoundError, UpstreamError
from fantasy_api.repositories.buyout import BuyoutRepository
from fantasy_api.repositories.leagues import LeaguesRepository
from fantasy_api.repositories.market import MarketRepository
from fantasy_api.repositories.players import PlayersRepository
from fantasy_api.schemas.buyout import ShieldStatus
from fantasy_api.schemas.leagues import FantasyLeague, LeagueTeam, TeamDetail
from fantasy_api.schemas.market import MarketSnapshot
from fantasy_api.schemas.payload import as_market_snapshot, as_object, as_object_list
from fantasy_api.schemas.players import LeaguePlayer
from fantasy_api.schemas.scouting import Observation
from fantasy_api.services.payload import parse_payload


def _model(data: Any, model: Any) -> Any:
    """Reject unrelated objects as well as invalid field types."""
    raw = parse_payload(as_object, data)
    keys = set(model.model_fields) | {
        field.alias for field in model.model_fields.values() if isinstance(field.alias, str)
    }
    if not raw or not keys.intersection(raw):
        raise UpstreamError("incomplete scouting snapshot", status_code=502)
    return parse_payload(model.model_validate, raw)


class ScoutingSources:
    """Reuse existing encoded read repositories; never expose Fantasy write methods."""

    def __init__(self, client: LaligaFantasyClient, competition_id: int) -> None:
        self._leagues = LeaguesRepository(client, competition_id=competition_id)
        self._players = PlayersRepository(client, competition_id=competition_id)
        self._market = MarketRepository(client, competition_id=competition_id)
        self._buyout = BuyoutRepository(client, competition_id=competition_id)

    async def membership(self, bearer: str, league_id: str) -> FantasyLeague:
        """Resolve league settings and the caller's manager from authenticated membership."""
        raw = parse_payload(as_object_list, await self._leagues.list_leagues(bearer))
        leagues = [_model(item, FantasyLeague) for item in raw]
        league = next((item for item in leagues if str(item.id) == league_id), None)
        if league is None:
            raise NotFoundError("league membership not found")
        if not league.team or league.team.id is None:
            raise UpstreamError("league identity is incomplete", status_code=502)
        return league

    async def market(self, bearer: str, league: str) -> dict[str, list[str]]:
        """Read one complete market; missing listing arrays are an upstream failure."""
        data = parse_payload(as_market_snapshot, await self._market.get_market(bearer, league))
        snapshot = _model(data, MarketSnapshot)
        if snapshot.market_players is None:
            raise UpstreamError("market listings are missing", status_code=502)
        result: dict[str, list[str]] = {}
        for listing in snapshot.market_players:
            if listing.direct_offer is True:
                continue
            if not listing.id or not listing.player_master or not listing.player_master.id:
                raise UpstreamError("market listing identity is missing", status_code=502)
            if listing.discr not in ("marketPlayerLeague", "market_player", "marketPlayerTeam"):
                raise UpstreamError("market listing type is unknown", status_code=502)
            result.setdefault(listing.player_master.id, []).append(str(listing.id))
            if listing.discr in ("marketPlayerLeague", "market_player"):
                result.setdefault("official:" + listing.player_master.id, []).append(
                    str(listing.id)
                )
        return result

    async def observe(
        self,
        bearer: str,
        league: FantasyLeague,
        player: str,
        listings: dict[str, list[str]],
        now: datetime,
        roster_cache: dict[str, Any] | None = None,
    ) -> Observation:
        """Read clause state and verify unknown shields before claiming availability."""
        card = _model(
            await self._players.get_league_player(bearer, player, str(league.id)), LeaguePlayer
        )
        if card.player_master and card.player_master.id and card.player_master.id != player:
            raise UpstreamError("player identity mismatch", status_code=502)
        manager = card.manager_id or (card.manager.id if card.manager else None)
        missing_clause = card.player_team_id and (
            card.buyout_clause is None or card.buyout_clause_locked_end_time is None
        )
        if missing_clause or (
            manager is None
            and (
                card.player_team_id
                or (listings.get(player) and not listings.get("official:" + player))
            )
        ):
            try:
                card = await self._complete_from_roster(
                    bearer,
                    str(league.id),
                    player,
                    card,
                    roster_cache if roster_cache is not None else {},
                )
            except UpstreamError as exc:
                if manager is None or exc.category == "scouting_snapshot_changed":
                    raise
                # Market monitoring can continue with known ownership and unknown clauses.
            manager = card.manager_id or (card.manager.id if card.manager else None)
        if manager is None and listings.get(player) and not listings.get("official:" + player):
            raise UpstreamError("listing owner is unknown", status_code=502)
        own = league.team.manager.id if league.team.manager else None
        owned = manager is not None and own is not None and str(manager) == str(own)
        if own is None:
            cache = roster_cache if roster_cache is not None else {}
            if "own_roster" not in cache:
                cache["own_roster"] = _model(
                    await self._leagues.get_team(bearer, str(league.id), str(league.team.id)),
                    TeamDetail,
                )
            roster = cache["own_roster"]
            if roster.id is not None and str(roster.id) != str(league.team.id):
                raise UpstreamError("own roster identity mismatch", status_code=502)
            own = roster.manager_id or (roster.manager.id if roster.manager else None)
            if own is not None:
                owned = manager is not None and str(manager) == str(own)
            else:
                if roster.players is None or any(
                    not slot.player_master or not slot.player_master.id for slot in roster.players
                ):
                    raise UpstreamError("own roster identity is incomplete", status_code=502)
                owned = any(slot.player_master.id == player for slot in roster.players)
        rival = manager is not None and not owned
        shield = card.is_shielded
        if rival and shield is None and card.player_team_id:
            try:
                shield = _model(
                    await self._buyout.check_shield(bearer, str(league.id), card.player_team_id),
                    ShieldStatus,
                ).is_shielded
            except (UpstreamError, NotFoundError):
                pass
        unlock = None
        if card.buyout_clause_locked_end_time:
            try:
                unlock = datetime.fromisoformat(
                    card.buyout_clause_locked_end_time.replace("Z", "+00:00")
                )
                if unlock.tzinfo is None:
                    unlock = None
                else:
                    unlock = unlock.astimezone(UTC)
            except ValueError:
                pass
        enabled = bool(
            league.config
            and league.config.features
            and league.config.features.buyout_clause is True
        )
        return Observation(
            name=(
                (card.player_master.nickname or card.player_master.name or player)
                if card.player_master
                else player
            ),
            listings=[] if owned else listings.get(player, []),
            owner_id=str(manager) if manager is not None else None,
            owner_name=card.manager.manager_name if card.manager else None,
            player_team_id=card.player_team_id,
            unlock_at=unlock,
            shielded=shield,
            clause=card.buyout_clause,
            clause_enabled=enabled,
            rival=rival,
            available=bool(
                rival
                and enabled
                and (card.buyout_clause or 0) > 0
                and unlock
                and unlock <= now
                and shield is False
            ),
            checked_at=now,
        )

    async def _complete_from_roster(
        self,
        bearer: str,
        league: str,
        player: str,
        card: LeaguePlayer,
        cache: dict[str, Any],
    ) -> LeaguePlayer:
        """Fill absent clause metadata once per roster in this monitoring pass."""
        manager = card.manager_id or (card.manager.id if card.manager else None)
        if "teams" not in cache:
            raw = parse_payload(as_object_list, await self._leagues.list_teams(bearer, league))
            cache["teams"] = [_model(item, LeagueTeam) for item in raw]
        for team in cache["teams"]:
            owner = team.manager_id or (team.manager.id if team.manager else None)
            if manager is not None and (owner is None or str(owner) != str(manager)):
                continue
            if team.id is None:
                continue
            key = "roster:" + str(team.id)
            if key not in cache:
                roster = (
                    team
                    if team.players is not None
                    else _model(
                        await self._leagues.get_team(bearer, league, str(team.id)), TeamDetail
                    )
                )
                if roster.players is None:
                    raise UpstreamError("roster players are missing", status_code=502)
                cache[key] = roster.players
            for slot in cache[key]:
                if not slot.player_master or slot.player_master.id != player:
                    continue
                if card.player_team_id and slot.player_team_id != card.player_team_id:
                    raise UpstreamError(
                        "player ownership changed during check",
                        status_code=502,
                        category="scouting_snapshot_changed",
                    )
                return card.model_copy(
                    update={
                        "manager_id": manager if manager is not None else owner,
                        "manager": card.manager or team.manager,
                        "player_team_id": card.player_team_id or slot.player_team_id,
                        "buyout_clause": (
                            card.buyout_clause
                            if card.buyout_clause is not None
                            else slot.buyout_clause
                        ),
                        "buyout_clause_locked_end_time": card.buyout_clause_locked_end_time
                        or slot.buyout_clause_locked_end_time,
                        "is_shielded": (
                            card.is_shielded if card.is_shielded is not None else slot.is_shielded
                        ),
                        "player_master": card.player_master or slot.player_master,
                    }
                )
        return card
