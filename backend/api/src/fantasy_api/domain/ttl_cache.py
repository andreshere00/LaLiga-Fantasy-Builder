"""Process-local TTL cache with single-flight refresh."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable


class AsyncTtlCache[T]:
    """Async TTL cache where concurrent misses await one fetch."""

    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._value: T | None = None
        self._expires_at: float = 0.0
        self._lock = asyncio.Lock()
        self._inflight: asyncio.Task[T] | None = None

    async def get_or_fetch(self, fetch: Callable[[], Awaitable[T]]) -> T:
        """Return cached value or await a single in-flight fetch."""
        now = time.monotonic()
        if self._value is not None and now < self._expires_at:
            return self._value
        async with self._lock:
            now = time.monotonic()
            if self._value is not None and now < self._expires_at:
                return self._value
            if self._inflight is not None:
                task = self._inflight
            else:
                task = asyncio.create_task(fetch())
                self._inflight = task
        try:
            value = await task
        finally:
            async with self._lock:
                if self._inflight is task:
                    self._inflight = None
        async with self._lock:
            self._value = value
            self._expires_at = time.monotonic() + self._ttl
        return value

    def clear(self) -> None:
        """Drop cached value."""
        self._value = None
        self._expires_at = 0.0
