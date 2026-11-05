"""Explicit revocable, league-scoped background credential delegation."""

from __future__ import annotations

import secrets
from typing import Any

from fantasy_auth.domain.errors import NeedsReauth
from fantasy_auth.ports.repos import ConnectionRepo


class ScoutingGrants:
    """Resolve opaque grants inside Auth; never trust a service-supplied owner."""

    def __init__(self, connections: ConnectionRepo, pool: Any = None) -> None:
        self._connections = connections
        self._pool = pool
        self._memory: dict[str, tuple[str, str, object]] = {}

    async def create(self, owner: str, league: str) -> str:
        """Create or reuse a grant after verifying the current connection."""
        connection = await self._connections.get(owner)
        if connection is None or connection.needs_reauth:
            raise NeedsReauth(owner)
        if self._pool is not None:
            return await self._pool.fetchval(
                "INSERT INTO scouting_grants (id,user_id,league_id) VALUES ($1,$2,$3) "
                "ON CONFLICT (user_id,league_id) DO UPDATE SET league_id=EXCLUDED.league_id "
                "RETURNING id",
                secrets.token_urlsafe(32),
                owner,
                league,
            )
        for key, (user, lid, profile) in list(self._memory.items()):
            if user == owner and lid == league and profile == connection.profile:
                return key
        grant = secrets.token_urlsafe(32)
        self._memory[grant] = (owner, league, connection.profile)
        return grant

    async def resolve(self, grant: str, league: str) -> str:
        """Resolve only an existing grant bound to this league and connection."""
        if self._pool is not None:
            owner = await self._pool.fetchval(
                "SELECT user_id FROM scouting_grants WHERE id=$1 AND league_id=$2", grant, league
            )
            if owner:
                return owner
        else:
            record = self._memory.get(grant)
            if record is not None:
                owner, lid, profile = record
                connection = await self._connections.get(owner)
                if lid == league and connection is not None and connection.profile == profile:
                    return owner
        raise NeedsReauth("", "delegation_revoked")

    async def revoke(self, owner: str, league: str) -> None:
        """Revoke a delegation using a verified JWT subject."""
        if self._pool is not None:
            await self._pool.execute(
                "DELETE FROM scouting_grants WHERE user_id=$1 AND league_id=$2", owner, league
            )
        else:
            self._memory = {
                key: record for key, record in self._memory.items() if record[:2] != (owner, league)
            }

    async def revoke_all(self, owner: str) -> None:
        """Invalidate every grant when pairing changes, including the same manager."""
        if self._pool is not None:
            await self._pool.execute("DELETE FROM scouting_grants WHERE user_id=$1", owner)
        else:
            self._memory = {key: value for key, value in self._memory.items() if value[0] != owner}
