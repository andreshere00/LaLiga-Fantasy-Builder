"""Favorites application service and background monitoring orchestration."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.clients.scouting_auth import ScoutingAuthClient
from fantasy_api.domain.errors import NeedsReauthError, NotFoundError, UpstreamError
from fantasy_api.repositories.scouting import ScoutingRepository
from fantasy_api.repositories.scouting_sources import ScoutingSources
from fantasy_api.schemas.scouting import (
    FavoritesResponse,
    InboxResponse,
    Observation,
    WatchWrite,
)
from fantasy_api.services.scouting_events import detect_events


class ScoutingService:
    """Scope every application operation to the verified subject."""

    def __init__(
        self,
        repository: ScoutingRepository,
        sources: ScoutingSources,
        credentials: AuthCredentialsClient,
        grants: ScoutingAuthClient,
    ) -> None:
        self.repository = repository
        self._sources = sources
        self._credentials = credentials
        self._grants = grants

    async def aclose(self) -> None:
        """Close application persistence and private grant client."""
        await self.repository.aclose()
        await self._grants.aclose()

    async def favorites(self, owner: str, league: str | None) -> FavoritesResponse:
        """Read favorites with last confirmed context for the selected league."""
        async with self.repository.session(owner) as session:
            return await session.favorites(league)

    async def add(self, owner: str, players: list[str]) -> None:
        """Union favorites without enabling league alerts."""
        async with self.repository.session(owner) as session:
            await session.add(players)

    async def remove(self, owner: str, jwt: str, player: str) -> None:
        """Remove a favorite and revoke grants for leagues with no remaining watches."""
        async with self.repository.session(owner) as session:
            inactive = await session.remove(player)
            for league in inactive:
                await self._grants.revoke(jwt, league)

    async def watch(
        self,
        owner: str,
        jwt: str,
        league: str,
        player: str,
        prefs: WatchWrite,
    ) -> None:
        """Verify league membership before enabling a revocable background watch."""
        async with self.repository.session(owner) as session:
            favorites = await session.favorites(None)
            if not any(item.player_id == player for item in favorites.favorites):
                raise NotFoundError("favorite not found")
            grant = None
            state = await session.league(league)
            name = state["league_name"] if state else league
            if prefs.market_alert or prefs.clause_alert:
                bearer = (await self._credentials.get_laliga_bearer(jwt)).bearer_token
                membership = await self._sources.membership(bearer, league)
                name = membership.name or league
                grant = await self._grants.create(jwt, league)
            await session.watch(league, player, prefs, name, grant)
            for inactive in await session.inactive_leagues():
                await self._grants.revoke(jwt, inactive)

    async def inbox(
        self,
        owner: str,
        league: str | None,
        cursor: int | None,
        limit: int,
    ) -> InboxResponse:
        """Read a page and a global unread count."""
        async with self.repository.session(owner) as session:
            return await session.inbox(league, cursor, limit)

    async def read(self, owner: str, notification: int) -> None:
        """Mark one owned notification read."""
        async with self.repository.session(owner) as session:
            await session.read(notification)

    async def delete_account(self, owner: str, jwt: str) -> None:
        """Erase app data; Auth connection removal revokes all credential grants."""
        async with self.repository.session(owner) as session:
            for league in await session.leagues():
                await self._grants.revoke(jwt, league)
            await session.delete_account()

    async def refresh(self, owner: str, jwt: str, league: str) -> None:
        """Revalidate membership and resume enabled watches after reconnection."""
        async with self.repository.session(owner) as session:
            watches = await session.watches(league)
            if not watches:
                return
            bearer = (await self._credentials.get_laliga_bearer(jwt)).bearer_token
            membership = await self._sources.membership(bearer, league)
            grant = await self._grants.create(jwt, league)
            watch = watches[0]
            await session.watch(
                league,
                watch["player_id"],
                WatchWrite(
                    **{key: watch[key] for key in ("market_alert", "clause_alert", "lead_hours")}
                ),
                membership.name or league,
                grant,
            )
            # A manual refresh cannot bypass the five-minute Fantasy polling budget.
            state = await session.league(league)
            if state and state["checked_at"] and state["status"] == "active":
                if state["checked_at"] > datetime.now(UTC) - timedelta(minutes=5):
                    return
        await self.evaluate(owner, league)

    async def evaluate(self, owner: str, league: str) -> None:
        """Perform a bounded read pass and atomically commit events and observations."""
        async with self.repository.session(owner) as session:
            state = await session.league(league)
            now = datetime.now(UTC)
            if not state or state["status"] not in ("active", "degraded"):
                return
            if state["next_check"] > now:
                return
            watches = await session.watches(league)
            if not watches or not state["grant_id"]:
                await session.inactive_leagues()
                return
            refreshed = False
            try:
                bearer = await self._grants.redeem(state["grant_id"], league)
                try:
                    membership = await self._sources.membership(bearer, league)
                    listings = await self._sources.market(bearer, league)
                except UpstreamError as exc:
                    if exc.status_code != 401:
                        raise
                    refreshed = True
                    bearer = await self._grants.redeem(
                        state["grant_id"], league, retry_unauthorized=True
                    )
                    membership = await self._sources.membership(bearer, league)
                    listings = await self._sources.market(bearer, league)
            except NeedsReauthError:
                await session.health(league, "needs_reauth", now, False)
                return
            except NotFoundError:
                await session.health(league, "not_member", now, False)
                return
            except UpstreamError:
                delay = min(3600, 300 * 2 ** min(state["failures"], 4))
                await session.health(league, "degraded", now + timedelta(seconds=delay), False)
                return
            next_check = now + timedelta(minutes=5)
            degraded = False
            roster_cache = {}
            for row in watches:
                try:
                    observation = await self._sources.observe(
                        bearer, membership, row["player_id"], listings, now, roster_cache
                    )
                except (UpstreamError, NotFoundError) as exc:
                    if isinstance(exc, UpstreamError) and exc.status_code == 401 and not refreshed:
                        refreshed = True
                        try:
                            bearer = await self._grants.redeem(
                                state["grant_id"], league, retry_unauthorized=True
                            )
                            observation = await self._sources.observe(
                                bearer, membership, row["player_id"], listings, now, roster_cache
                            )
                        except NeedsReauthError:
                            await session.health(league, "needs_reauth", now, False)
                            return
                        except (UpstreamError, NotFoundError):
                            degraded = True
                            continue
                    else:
                        degraded = True
                        if isinstance(exc, UpstreamError) and exc.status_code == 429:
                            next_check = now + timedelta(
                                seconds=min(3600, 300 * 2 ** min(state["failures"], 4))
                            )
                            break
                        continue
                previous = (
                    Observation.model_validate_json(row["observation"])
                    if row["observation"]
                    else None
                )
                prefs = WatchWrite(
                    **{key: row[key] for key in ("market_alert", "clause_alert", "lead_hours")}
                )
                observation, events, next_player_check = detect_events(
                    previous, observation, prefs, now
                )
                next_check = min(next_check, next_player_check)
                await session.observe(
                    league, row["player_id"], observation, events, membership.name or league
                )
            await session.health(
                league, "degraded" if degraded else "active", next_check, not degraded
            )
