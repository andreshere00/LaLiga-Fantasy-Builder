"""Injectable time source so limiter, cache and retry tests need no real sleeping."""

import asyncio
import time
from typing import Protocol


class Clock(Protocol):
    """Monotonic time plus an awaitable sleep."""

    def monotonic(self) -> float:
        """Return seconds on a monotonic scale."""
        ...

    async def sleep(self, seconds: float) -> None:
        """Wait for ``seconds``."""
        ...


class SystemClock:
    """Real clock."""

    def monotonic(self) -> float:
        """Return ``time.monotonic()``."""
        return time.monotonic()

    async def sleep(self, seconds: float) -> None:
        """Delegate to ``asyncio.sleep``."""
        await asyncio.sleep(seconds)
