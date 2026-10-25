"""Async PostgreSQL adapters for pairing challenges and connections."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any

import asyncpg

from fantasy_auth.domain.users import LaligaUser
from fantasy_auth.ports.repos import BrowserPairingRecord, ConnectionRecord, PairingRecord


def _to_dt(unix_ts: int) -> datetime:
    return datetime.fromtimestamp(unix_ts, tz=UTC)


def _from_dt(value: datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return int(value.timestamp())


def _profile_to_json(profile: LaligaUser | None) -> str | None:
    if profile is None:
        return None
    return json.dumps(
        {
            "authenticated": profile.authenticated,
            "sub": profile.sub,
            "oid": profile.oid,
            "email": profile.email,
            "name": profile.name,
            "given_name": profile.given_name,
            "family_name": profile.family_name,
            "idp": profile.idp,
            "user_id": profile.user_id,
            "username": profile.username,
            "display_name": profile.display_name,
            "manager_name": profile.manager_name,
            "avatar": profile.avatar,
        }
    )


def _profile_from_json(raw: Any) -> LaligaUser | None:
    if raw is None:
        return None
    data = raw if isinstance(raw, dict) else json.loads(raw)
    return LaligaUser(
        authenticated=bool(data.get("authenticated", True)),
        sub=data.get("sub"),
        oid=data.get("oid"),
        email=data.get("email"),
        name=data.get("name"),
        given_name=data.get("given_name"),
        family_name=data.get("family_name"),
        idp=data.get("idp"),
        user_id=data.get("user_id"),
        username=data.get("username"),
        display_name=data.get("display_name"),
        manager_name=data.get("manager_name"),
        avatar=data.get("avatar"),
    )


class PostgresPairingStore:
    """Postgres-backed pairing store with atomic consume."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def save(self, pairing: PairingRecord) -> None:
        """Create a pairing record.

        Args:
            pairing: Pairing to persist.
        """
        await self._pool.execute(
            """
            INSERT INTO pairings (
                id, user_id, secret_hash, expires_at, consumed, nonce
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                secret_hash = EXCLUDED.secret_hash,
                expires_at = EXCLUDED.expires_at,
                consumed = EXCLUDED.consumed,
                nonce = EXCLUDED.nonce
            """,
            pairing.pairing_id,
            pairing.user_id,
            pairing.secret_hash,
            _to_dt(pairing.expires_at),
            pairing.consumed,
            pairing.nonce,
        )

    async def get(self, pairing_id: str) -> PairingRecord | None:
        """Load a pairing by ID.

        Args:
            pairing_id: Public pairing identifier.

        Returns:
            Pairing record or None.
        """
        row = await self._pool.fetchrow(
            "SELECT * FROM pairings WHERE id = $1",
            pairing_id,
        )
        if row is None:
            return None
        return PairingRecord(
            pairing_id=row["id"],
            user_id=row["user_id"],
            secret_hash=row["secret_hash"],
            expires_at=_from_dt(row["expires_at"]),
            consumed=bool(row["consumed"]),
            nonce=row["nonce"],
        )

    async def consume(self, pairing_id: str, *, now: int) -> PairingRecord | None:
        """Atomically mark a pairing as consumed if still valid.

        Args:
            pairing_id: Pairing to consume.
            now: Current Unix timestamp.

        Returns:
            The pre-consume record if successfully consumed, else None.
        """
        row = await self._pool.fetchrow(
            """
            UPDATE pairings
            SET consumed = TRUE
            WHERE id = $1
              AND consumed = FALSE
              AND expires_at > to_timestamp($2)
            RETURNING id, user_id, secret_hash, expires_at, nonce, consumed
            """,
            pairing_id,
            now,
        )
        if row is None:
            return None
        return PairingRecord(
            pairing_id=row["id"],
            user_id=row["user_id"],
            secret_hash=row["secret_hash"],
            expires_at=_from_dt(row["expires_at"]),
            consumed=False,
            nonce=row["nonce"],
        )

    async def cancel(self, user_id: str) -> None:
        """Invalidate outstanding challenges for this owner."""
        await self._pool.execute("UPDATE pairings SET consumed = TRUE WHERE user_id = $1", user_id)


class PostgresConnectionRepo:
    """Postgres-backed LaLiga connection repository."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def get(self, user_id: str) -> ConnectionRecord | None:
        """Load the connection for a user.

        Args:
            user_id: Application user ID.

        Returns:
            Connection record or None.
        """
        row = await self._pool.fetchrow(
            "SELECT * FROM connections WHERE user_id = $1",
            user_id,
        )
        if row is None:
            return None
        return ConnectionRecord(
            user_id=row["user_id"],
            sealed_blob=bytes(row["sealed_blob"]),
            policy=row["policy"],
            client_id=row["client_id"],
            scope=row["scope"],
            needs_reauth=bool(row["needs_reauth"]),
            profile=_profile_from_json(row["profile_json"]),
        )

    async def save(self, connection: ConnectionRecord) -> None:
        """Upsert a connection.

        Args:
            connection: Connection to persist.
        """
        profile_json = _profile_to_json(connection.profile)
        await self._pool.execute(
            """
            INSERT INTO connections (
                user_id, sealed_blob, policy, client_id, scope,
                needs_reauth, profile_json
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            ON CONFLICT (user_id) DO UPDATE SET
                sealed_blob = EXCLUDED.sealed_blob,
                policy = EXCLUDED.policy,
                client_id = EXCLUDED.client_id,
                scope = EXCLUDED.scope,
                needs_reauth = EXCLUDED.needs_reauth,
                profile_json = EXCLUDED.profile_json
            """,
            connection.user_id,
            connection.sealed_blob,
            connection.policy,
            connection.client_id,
            connection.scope,
            connection.needs_reauth,
            profile_json,
        )

    async def delete(self, user_id: str) -> None:
        """Remove sealed tokens for a user.

        Args:
            user_id: Application user ID.
        """
        await self._pool.execute(
            "DELETE FROM connections WHERE user_id = $1",
            user_id,
        )


class PostgresBrowserPairingStore:
    """Postgres native challenges with indexed state and atomic consumption."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def save(self, record: BrowserPairingRecord, *, now: int) -> None:
        """Save a challenge and remove expired secrets transactionally."""
        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute(
                "DELETE FROM browser_pairings WHERE expires_at <= to_timestamp($1)", now
            )
            await conn.execute(
                """INSERT INTO browser_pairings
                (state, user_id, pairing_id, secret, code_verifier, expires_at)
                VALUES ($1, $2, $3, $4, $5, to_timestamp($6))""",
                record.state,
                record.user_id,
                record.pairing_id,
                record.secret,
                record.code_verifier,
                record.expires_at,
            )

    async def consume(self, state: str, *, now: int) -> BrowserPairingRecord | None:
        """Delete and return a live challenge exactly once across workers."""
        row = await self._pool.fetchrow(
            "DELETE FROM browser_pairings WHERE state = $1 RETURNING *",
            state,
        )
        if row is None or _from_dt(row["expires_at"]) <= now:
            return None
        return BrowserPairingRecord(
            state=row["state"],
            user_id=row["user_id"],
            pairing_id=row["pairing_id"],
            secret=row["secret"],
            code_verifier=row["code_verifier"],
            expires_at=_from_dt(row["expires_at"]),
        )

    async def cancel(self, user_id: str) -> None:
        """Cancel pending callbacks for the verified owner."""
        await self._pool.execute("DELETE FROM browser_pairings WHERE user_id = $1", user_id)


class PostgresRefreshLock:
    """Session advisory locks serialize vault writes without expiring mid-request."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        self._held: dict[str, Any] = {}
        # Runtime pools have ten connections. Reserve capacity for the repository
        # queries executed while a lock connection is held; never exhaust the pool.
        self._slots = asyncio.Semaphore(4)

    async def acquire(self, user_id: str, *, ttl_seconds: int = 30) -> bool:
        """Try to hold a dedicated connection until the vault operation finishes."""
        del ttl_seconds
        if self._slots.locked():
            return False
        await self._slots.acquire()
        try:
            conn = await self._pool.acquire(timeout=5)
        except BaseException:
            self._slots.release()
            raise
        try:
            acquired = await conn.fetchval(
                "SELECT pg_try_advisory_lock(hashtextextended($1, 94731))", user_id
            )
        except BaseException:
            await self._pool.release(conn)
            self._slots.release()
            raise
        if not acquired:
            await self._pool.release(conn)
            self._slots.release()
            return False
        self._held[user_id] = conn
        return True

    async def release(self, user_id: str) -> None:
        """Release the owning database session and its advisory lock."""
        conn = self._held.pop(user_id, None)
        if conn is not None:
            try:
                await conn.execute(
                    "SELECT pg_advisory_unlock(hashtextextended($1, 94731))", user_id
                )
            finally:
                try:
                    await self._pool.release(conn)
                finally:
                    self._slots.release()
