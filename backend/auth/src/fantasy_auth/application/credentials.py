"""Credential provider: early refresh with per-user singleflight."""

from __future__ import annotations

import asyncio
from dataclasses import replace

from fantasy_auth.domain.errors import InvalidGrant, NeedsReauth, OwnershipError
from fantasy_auth.domain.tokens import is_expired, merge_refresh
from fantasy_auth.ports.b2c import B2CClient
from fantasy_auth.ports.repos import Clock, ConnectionRecord, ConnectionRepo
from fantasy_auth.ports.vault import TokenVault


class CredentialProvider:
    """Provide a valid LaLiga bearer for an application user.

    Ports ``refreshToken`` + ``inflightRefresh`` from authStore: concurrent
    callers share one in-flight refresh per user via ``asyncio.Lock``.

    Args:
        connections: Connection repository.
        vault: Token vault.
        b2c: B2C client for refresh.
        clock: Injectable clock.
        refresh_skew_seconds: Seconds before expiry to refresh.
        allow_id_token_fallback: Fallback policy for refresh merge.
    """

    def __init__(
        self,
        *,
        connections: ConnectionRepo,
        vault: TokenVault,
        b2c: B2CClient,
        clock: Clock,
        refresh_skew_seconds: int = 60,
        allow_id_token_fallback: bool = False,
    ) -> None:
        self._connections = connections
        self._vault = vault
        self._b2c = b2c
        self._clock = clock
        self._refresh_skew_seconds = refresh_skew_seconds
        self._allow_id_token_fallback = allow_id_token_fallback
        self._locks: dict[str, asyncio.Lock] = {}

    def _lock_for(self, user_id: str) -> asyncio.Lock:
        if user_id not in self._locks:
            self._locks[user_id] = asyncio.Lock()
        return self._locks[user_id]

    async def get_valid_bearer_token(self, user_id: str) -> str:
        """Return a non-expired bearer, refreshing once if needed.

        Args:
            user_id: Application user that owns the connection.

        Returns:
            Bearer token string for Fantasy API calls.

        Raises:
            NeedsReauth: When no connection exists or refresh is invalid_grant.
            OwnershipError: If a record's user_id does not match (defense).
        """
        async with self._lock_for(user_id):
            connection = await self._require_connection(user_id)
            if connection.needs_reauth:
                raise NeedsReauth(user_id)

            bundle = self._vault.open(connection.sealed_blob)
            now = self._clock.now()
            if not is_expired(
                bundle,
                now=now,
                skew_seconds=self._refresh_skew_seconds,
            ):
                return bundle.bearer()

            if not bundle.refresh_token:
                await self._mark_needs_reauth(connection)
                raise NeedsReauth(user_id)

            try:
                raw = await self._b2c.refresh(
                    refresh_token=bundle.refresh_token,
                    client_id=bundle.client_id,
                    policy=bundle.policy,
                    scope=bundle.scope,
                )
            except InvalidGrant:
                await self._mark_needs_reauth(connection)
                raise NeedsReauth(user_id) from None

            new_bundle = merge_refresh(
                bundle,
                raw,
                now=self._clock.now(),
                allow_id_token_fallback=self._allow_id_token_fallback,
            )
            sealed = self._vault.seal(new_bundle)
            updated = replace(
                connection,
                sealed_blob=sealed,
                policy=new_bundle.policy,
                client_id=new_bundle.client_id,
                scope=new_bundle.scope,
                needs_reauth=False,
            )
            await self._connections.save(updated)
            return new_bundle.bearer()

    async def retry_after_unauthorized(self, user_id: str) -> str:
        """Force a single refresh after a Fantasy ``401`` and return bearer.

        Args:
            user_id: Application user ID.

        Returns:
            Fresh bearer token.

        Raises:
            NeedsReauth: When refresh fails permanently.
        """
        async with self._lock_for(user_id):
            connection = await self._require_connection(user_id)
            if connection.needs_reauth:
                raise NeedsReauth(user_id)

            bundle = self._vault.open(connection.sealed_blob)
            if not bundle.refresh_token:
                await self._mark_needs_reauth(connection)
                raise NeedsReauth(user_id)

            try:
                raw = await self._b2c.refresh(
                    refresh_token=bundle.refresh_token,
                    client_id=bundle.client_id,
                    policy=bundle.policy,
                    scope=bundle.scope,
                )
            except InvalidGrant:
                await self._mark_needs_reauth(connection)
                raise NeedsReauth(user_id) from None

            new_bundle = merge_refresh(
                bundle,
                raw,
                now=self._clock.now(),
                allow_id_token_fallback=self._allow_id_token_fallback,
            )
            sealed = self._vault.seal(new_bundle)
            updated = replace(
                connection,
                sealed_blob=sealed,
                needs_reauth=False,
            )
            await self._connections.save(updated)
            return new_bundle.bearer()

    async def _require_connection(self, user_id: str) -> ConnectionRecord:
        connection = await self._connections.get(user_id)
        if connection is None:
            raise NeedsReauth(user_id, "no_laliga_connection")
        if connection.user_id != user_id:
            raise OwnershipError()
        return connection

    async def _mark_needs_reauth(self, connection: ConnectionRecord) -> None:
        updated = replace(connection, needs_reauth=True)
        await self._connections.save(updated)
