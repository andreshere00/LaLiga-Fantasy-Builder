"""Repository and clock ports for sessions, pairings, and connections."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from fantasy_auth.domain.users import AppUser, LaligaUser


@dataclass(frozen=True, slots=True)
class SessionRecord:
    """Server-side application session.

    Attributes:
        session_id: Opaque session identifier (cookie value).
        user: Authenticated app user.
        csrf_token: CSRF double-submit token.
        expires_at: Unix timestamp when the session expires.
        oidc_state: Pending OIDC state during login (optional).
        oidc_nonce: Pending OIDC nonce during login (optional).
        oidc_code_verifier: PKCE verifier for app IdP (optional).
    """

    session_id: str
    user: AppUser | None
    csrf_token: str
    expires_at: int
    oidc_state: str | None = None
    oidc_nonce: str | None = None
    oidc_code_verifier: str | None = None


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


class SessionStore(Protocol):
    """Server-side session persistence."""

    async def save(self, session: SessionRecord) -> None:
        """Upsert a session record."""

    async def get(self, session_id: str) -> SessionRecord | None:
        """Load a session by opaque ID."""

    async def delete(self, session_id: str) -> None:
        """Delete a session (logout)."""


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
