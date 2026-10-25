"""Repository and clock ports for pairing challenges and connections."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from fantasy_auth.domain.users import LaligaUser


@dataclass(frozen=True, slots=True)
class PairingRecord:
    """One-time pairing challenge for the local PKCE helper.

    Attributes:
        pairing_id: Public pairing identifier.
        user_id: Owning application user.
        secret_hash: SHA-256 hex digest of the pairing secret.
        expires_at: Unix timestamp when the pairing expires.
        consumed: Whether the pairing was already completed.
        nonce: Expected OIDC nonce for the helper's authorize request.
    """

    pairing_id: str
    user_id: str
    secret_hash: str
    expires_at: int
    consumed: bool = False
    nonce: str | None = None


@dataclass(frozen=True, slots=True)
class ConnectionRecord:
    """Persisted LaLiga connection for an application user.

    Attributes:
        user_id: Owning application user.
        sealed_blob: AES-GCM sealed token envelope.
        policy: Issuing B2C policy.
        client_id: Issuing B2C client.
        scope: Issuing scope string.
        needs_reauth: True when refresh failed permanently.
        profile: Optional last-known LaLiga profile (no secrets).
    """

    user_id: str
    sealed_blob: bytes
    policy: str
    client_id: str
    scope: str
    needs_reauth: bool = False
    profile: LaligaUser | None = None


class Clock(Protocol):
    """Injectable clock for hermetic tests."""

    def now(self) -> int:
        """Return the current Unix timestamp in seconds."""


class PairingStore(Protocol):
    """One-time pairing persistence with atomic consume."""

    async def save(self, pairing: PairingRecord) -> None:
        """Create a pairing record."""

    async def get(self, pairing_id: str) -> PairingRecord | None:
        """Load a pairing by ID."""

    async def consume(self, pairing_id: str, *, now: int) -> PairingRecord | None:
        """Atomically mark a pairing as consumed if still valid.

        Args:
            pairing_id: Pairing to consume.
            now: Current Unix timestamp.

        Returns:
            The pre-consume record if successfully consumed, else None.
        """

    async def cancel(self, user_id: str) -> None:
        """Invalidate all pending pairings for the verified owner."""


class ConnectionRepo(Protocol):
    """LaLiga connection persistence keyed by application user."""

    async def get(self, user_id: str) -> ConnectionRecord | None:
        """Load the connection for a user."""

    async def save(self, connection: ConnectionRecord) -> None:
        """Upsert a connection (atomic replace on refresh)."""

    async def delete(self, user_id: str) -> None:
        """Remove sealed tokens for a user."""


class RateLimiter(Protocol):
    """Simple sliding-window rate limiter."""

    async def allow(self, key: str, *, limit: int, window_seconds: int) -> bool:
        """Return True if the key is under the limit for the window."""


class RefreshLock(Protocol):
    """Distributed lock for per-user token refresh singleflight."""

    async def acquire(self, user_id: str, *, ttl_seconds: int = 30) -> bool:
        """Try to acquire the refresh lock for ``user_id``.

        Args:
            user_id: Application user ID.
            ttl_seconds: Lock expiry to avoid deadlocks.

        Returns:
            True when the lock was acquired.
        """

    async def release(self, user_id: str) -> None:
        """Release the refresh lock for ``user_id``.

        Args:
            user_id: Application user ID.
        """


@dataclass(frozen=True, slots=True)
class BrowserPairingRecord:
    """Pending native callback bound to its initiating application subject."""

    state: str
    user_id: str
    pairing_id: str
    secret: str
    code_verifier: str
    expires_at: int


class BrowserPairingStore(Protocol):
    """Independent, expiring, single-use browser pairing persistence."""

    async def save(self, record: BrowserPairingRecord, *, now: int) -> None:
        """Store a challenge and clean up expired secrets."""

    async def consume(self, state: str, *, now: int) -> BrowserPairingRecord | None:
        """Atomically remove and return a live challenge."""

    async def cancel(self, user_id: str) -> None:
        """Remove all pending challenges belonging to the verified user."""
