"""Auto-market rule management; the worker executes what a user armed here."""

from __future__ import annotations

from contextlib import suppress
from datetime import UTC, datetime

from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.clients.scouting_auth import ScoutingAuthClient
from fantasy_api.domain.errors import NeedsReauthError, NotFoundError, UpstreamError
from fantasy_api.repositories.auto_market import AutoMarketRepository
from fantasy_api.repositories.auto_market_sources import AutoMarketSources, PlayerSnapshot
from fantasy_api.schemas.auto_market import (
    AutoExecutionsResponse,
    AutoRulesResponse,
    AutoRuleWrite,
)
from fantasy_api.schemas.leagues import FantasyLeague


def _own_manager(league: FantasyLeague) -> str | None:
    """Return the caller's manager id when the membership response carries it."""
    manager = league.team.manager if league.team else None
    return str(manager.id) if manager is not None and manager.id is not None else None


class AutoMarketService:
    """Scope every operation to the verified subject; arming is the user's confirmation."""

    def __init__(
        self,
        repository: AutoMarketRepository,
        sources: AutoMarketSources,
        credentials: AuthCredentialsClient,
        grants: ScoutingAuthClient,
    ) -> None:
        self.repository = repository
        self._sources = sources
        self._credentials = credentials
        self._grants = grants

    async def aclose(self) -> None:
        """Close application persistence and the private grant client."""
        await self.repository.aclose()
        await self._grants.aclose()

    async def rules(self, owner: str, league: str) -> AutoRulesResponse:
        """Read this league's rules with the worker's health."""
        async with self.repository.session(owner) as session:
            return await session.rules(league)

    async def executions(self, owner: str, league: str, limit: int) -> AutoExecutionsResponse:
        """Read the newest attempts for this league."""
        async with self.repository.session(owner) as session:
            return await session.executions(league, limit)

    async def arm(self, owner: str, jwt: str, league: str, write: AutoRuleWrite) -> int:
        """Verify membership and the player, then store the rule and its write delegation."""
        self._check_expiry(write)
        bearer = (await self._credentials.get_laliga_bearer(jwt)).bearer_token
        membership = await self._sources.membership(bearer, league)
        snapshot = await self._sources.snapshot(bearer, league, write.player_id)
        self._check_ownership(write, _own_manager(membership), snapshot)
        grant = await self._grants.create(jwt, league)
        async with self.repository.session(owner) as session:
            return await session.arm(
                league,
                membership.name or league,
                grant,
                write,
                snapshot.name,
                snapshot.market_value,
            )

    async def update(
        self, owner: str, jwt: str, league: str, rule_id: int, write: AutoRuleWrite
    ) -> None:
        """Replace an armed rule; re-confirming renews the grant and resumes a paused league."""
        self._check_expiry(write)
        bearer = (await self._credentials.get_laliga_bearer(jwt)).bearer_token
        membership = await self._sources.membership(bearer, league)
        snapshot = await self._sources.snapshot(bearer, league, write.player_id)
        self._check_ownership(write, _own_manager(membership), snapshot)
        grant = await self._grants.create(jwt, league)
        async with self.repository.session(owner) as session:
            await session.replace(league, rule_id, write, snapshot.name, snapshot.market_value)
            await session.resume(league, grant)

    async def cancel(self, owner: str, jwt: str, league: str, rule_id: int) -> None:
        """Cancel a live rule and revoke the write delegation once none remain."""
        async with self.repository.session(owner) as session:
            idle = await session.cancel(league, rule_id)
        if idle:
            # The rule is already cancelled and the worker idle; a failed revoke only leaves
            # an unused grant that expires, so it must not undo the cancellation.
            with suppress(UpstreamError, NeedsReauthError):
                await self._grants.revoke(jwt, league)

    async def delete_account(self, owner: str, jwt: str) -> None:
        """Erase app data and revoke every write delegation."""
        async with self.repository.session(owner) as session:
            for league in await session.leagues():
                await self._grants.revoke(jwt, league)
            await session.delete_account()

    @staticmethod
    def _check_expiry(write: AutoRuleWrite) -> None:
        """Reject a deadline that has already passed."""
        if write.expires_at is not None and write.expires_at <= datetime.now(UTC):
            raise UpstreamError(
                "expiresAt must be in the future", status_code=422, category="invalid_rule"
            )

    @staticmethod
    def _check_ownership(write: AutoRuleWrite, own: str | None, snapshot: PlayerSnapshot) -> None:
        """Sell only your own entry and buy only a rival's; unknown ownership is rechecked."""
        if write.player_team_id and snapshot.player_team_id:
            if write.player_team_id != snapshot.player_team_id:
                raise NotFoundError("squad entry does not match the player")
        if own is None or snapshot.owner_id is None:
            return
        owned = str(own) == snapshot.owner_id
        if write.side == "sell" and not owned:
            raise NotFoundError("player is not in your squad")
        if write.side == "buy" and owned:
            raise NotFoundError("player is already in your squad")
