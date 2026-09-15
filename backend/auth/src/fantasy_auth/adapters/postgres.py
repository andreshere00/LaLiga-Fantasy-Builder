"""Async PostgreSQL adapters for sessions, pairings, and connections."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import asyncpg

from fantasy_auth.domain.users import AppUser, LaligaUser
from fantasy_auth.ports.repos import ConnectionRecord, PairingRecord, SessionRecord


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


class PostgresSessionStore:
    """Postgres-backed session store."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def save(self, session: SessionRecord) -> None:
        """Upsert a session record.

        Args:
            session: Session to persist.
        """
        user = session.user
        await self._pool.execute(
            """
            INSERT INTO sessions (
                session_id, user_id, email, name, csrf_token, expires_at,
                oidc_state, oidc_nonce, oidc_code_verifier
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (session_id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                email = EXCLUDED.email,
                name = EXCLUDED.name,
                csrf_token = EXCLUDED.csrf_token,
                expires_at = EXCLUDED.expires_at,
                oidc_state = EXCLUDED.oidc_state,
                oidc_nonce = EXCLUDED.oidc_nonce,
                oidc_code_verifier = EXCLUDED.oidc_code_verifier
            """,
            session.session_id,
            user.user_id if user else None,
            user.email if user else None,
            user.name if user else None,
            session.csrf_token,
            _to_dt(session.expires_at),
            session.oidc_state,
            session.oidc_nonce,
            session.oidc_code_verifier,
        )

    async def get(self, session_id: str) -> SessionRecord | None:
        """Load a session by opaque ID.

        Args:
            session_id: Session cookie value.

        Returns:
            Session record or None.
        """
        row = await self._pool.fetchrow(
            "SELECT * FROM sessions WHERE session_id = $1",
            session_id,
        )
        if row is None:
            return None
        user = None
        if row["user_id"] is not None:
            user = AppUser(
                user_id=row["user_id"],
                email=row["email"],
                name=row["name"],
            )
        return SessionRecord(
            session_id=row["session_id"],
            user=user,
            csrf_token=row["csrf_token"],
            expires_at=_from_dt(row["expires_at"]),
            oidc_state=row["oidc_state"],
            oidc_nonce=row["oidc_nonce"],
            oidc_code_verifier=row["oidc_code_verifier"],
        )

    async def delete(self, session_id: str) -> None:
        """Delete a session.

        Args:
            session_id: Session to remove.
        """
        await self._pool.execute(
            "DELETE FROM sessions WHERE session_id = $1",
            session_id,
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
