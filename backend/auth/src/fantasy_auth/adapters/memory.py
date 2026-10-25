"""In-memory adapters for hermetic tests and local development."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import replace

from fantasy_auth.ports.repos import (
    BrowserPairingRecord,
    ConnectionRecord,
    PairingRecord,
)


class SystemClock:
    """Wall-clock implementation of the Clock port."""

    def now(self) -> int:
        """Return the current Unix timestamp in seconds.

        Returns:
            Current time as Unix seconds.
        """
        return int(time.time())


class FixedClock:
    """Deterministic clock for tests.

    Args:
        initial: Starting Unix timestamp.
    """

    def __init__(self, initial: int) -> None:
        self._now = initial

    def now(self) -> int:
        """Return the frozen timestamp.

        Returns:
            Current fixed Unix seconds.
        """
        return self._now

    def advance(self, seconds: int) -> None:
        """Advance the clock by ``seconds``.

        Args:
            seconds: Seconds to add.
        """
        self._now += seconds


class MemoryPairingStore:
    """Dict-backed pairing store with atomic consume."""

    def __init__(self) -> None:
        self._pairings: dict[str, PairingRecord] = {}

    async def save(self, pairing: PairingRecord) -> None:
        """Create a pairing record.

        Args:
            pairing: Pairing to persist.
        """
        self._pairings[pairing.pairing_id] = pairing

    async def get(self, pairing_id: str) -> PairingRecord | None:
        """Load a pairing by ID.

        Args:
            pairing_id: Public pairing identifier.

        Returns:
            Pairing record or None.
        """
        return self._pairings.get(pairing_id)

    async def consume(self, pairing_id: str, *, now: int) -> PairingRecord | None:
        """Atomically mark a pairing as consumed if still valid.

        Args:
            pairing_id: Pairing to consume.
            now: Current Unix timestamp.

        Returns:
            The pre-consume record if successfully consumed, else None.
        """
        pairing = self._pairings.get(pairing_id)
        if pairing is None:
            return None
        if pairing.consumed or pairing.expires_at <= now:
            return None
        self._pairings[pairing_id] = replace(pairing, consumed=True)
        return pairing

    async def cancel(self, user_id: str) -> None:
        """Invalidate outstanding challenges for this owner."""
        for key, value in self._pairings.items():
            if value.user_id == user_id:
                self._pairings[key] = replace(value, consumed=True)


class MemoryConnectionRepo:
    """Dict-backed LaLiga connection repository."""

    def __init__(self) -> None:
        self._connections: dict[str, ConnectionRecord] = {}

    async def get(self, user_id: str) -> ConnectionRecord | None:
        """Load the connection for a user.

        Args:
            user_id: Application user ID.

        Returns:
            Connection record or None.
        """
        return self._connections.get(user_id)

    async def save(self, connection: ConnectionRecord) -> None:
        """Upsert a connection.

        Args:
            connection: Connection to persist.
        """
        self._connections[connection.user_id] = connection

    async def delete(self, user_id: str) -> None:
        """Remove sealed tokens for a user.

        Args:
            user_id: Application user ID.
        """
        self._connections.pop(user_id, None)


class MemoryRateLimiter:
    """In-memory sliding-window rate limiter."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def allow(self, key: str, *, limit: int, window_seconds: int) -> bool:
        """Return True if the key is under the limit for the window.

        Args:
            key: Rate-limit bucket key (e.g. client IP).
            limit: Max allowed events in the window.
            window_seconds: Window size in seconds.

        Returns:
            True when the request is allowed.
        """
        now = time.monotonic()
        bucket = self._hits[key]
        cutoff = now - window_seconds
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True


class MemoryBrowserPairingStore:
    """Atomic in-process native callback challenges; no application sessions."""

    def __init__(self) -> None:
        self._records: dict[str, BrowserPairingRecord] = {}

    async def save(self, record: BrowserPairingRecord, *, now: int) -> None:
        """Save a challenge, pruning expired secrets."""
        self._records = {
            key: value for key, value in self._records.items() if value.expires_at > now
        }
        self._records[record.state] = record

    async def consume(self, state: str, *, now: int) -> BrowserPairingRecord | None:
        """Consume at most once, rejecting expired challenges."""
        record = self._records.pop(state, None)
        return record if record and record.expires_at > now else None

    async def cancel(self, user_id: str) -> None:
        """Cancel only this user's pending native callbacks."""
        self._records = {
            key: value for key, value in self._records.items() if value.user_id != user_id
        }
