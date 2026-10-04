"""Per-subject sliding-window rate limiter."""

from __future__ import annotations

import asyncio
import time
from collections import deque


class RateLimiter:
    """In-process sliding window limiter keyed by JWT subject."""

    def __init__(self, *, limit_per_minute: int) -> None:
        self._limit = limit_per_minute
        self._events: dict[str, deque[float]] = {}
        self._lock = asyncio.Lock()

    async def check(self, subject: str) -> int | None:
        """Record one event and return retry-after seconds when limited."""
        now = time.monotonic()
        window_start = now - 60.0
        async with self._lock:
            bucket = self._events.setdefault(subject, deque())
            while bucket and bucket[0] < window_start:
                bucket.popleft()
            if not bucket:
                self._events.pop(subject, None)
                bucket = self._events.setdefault(subject, deque())
            if len(bucket) >= self._limit:
                retry = int(max(1.0, 60.0 - (now - bucket[0])))
                return retry
            bucket.append(now)
        return None


_limiters: dict[int, RateLimiter] = {}


def get_rate_limiter(limit_per_minute: int) -> RateLimiter:
    """Return a shared limiter for the given per-minute cap."""
    if limit_per_minute not in _limiters:
        _limiters[limit_per_minute] = RateLimiter(limit_per_minute=limit_per_minute)
    return _limiters[limit_per_minute]
