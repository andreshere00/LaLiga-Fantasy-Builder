"""Token bucket and circuit breaker, both driven by an injectable clock."""

from fantasy_scraping.scraper.clock import Clock
from fantasy_scraping.scraper.errors import CircuitOpenError


class TokenBucket:
    """Rate limiter allowing short bursts."""

    def __init__(self, rate: float, burst: int, clock: Clock) -> None:
        """Start full.

        Args:
            rate: Tokens added per second.
            burst: Bucket capacity.
            clock: Time source.
        """
        self._rate: float = rate
        self._burst: int = burst
        self._clock: Clock = clock
        self._tokens: float = float(burst)
        self._stamp: float = clock.monotonic()

    async def acquire(self) -> None:
        """Wait until one token is available, then take it."""
        while True:
            now = self._clock.monotonic()
            self._tokens = min(self._burst, self._tokens + (now - self._stamp) * self._rate)
            self._stamp = now
            if self._tokens >= 1:
                self._tokens -= 1
                return
            await self._clock.sleep((1 - self._tokens) / self._rate)


class CircuitBreaker:
    """Opens after repeated failures; lets one probe through when half open."""

    def __init__(
        self, clock: Clock, *, threshold: int = 5, window_s: float = 60, cooldown_s: float = 60
    ) -> None:
        """Configure thresholds.

        Args:
            clock: Time source.
            threshold: Failures inside the window that open the circuit.
            window_s: Failure window in seconds.
            cooldown_s: Seconds the circuit stays open.
        """
        self._clock: Clock = clock
        self._threshold: int = threshold
        self._window: float = window_s
        self._cooldown: float = cooldown_s
        self._failures: list[float] = []
        self._opened_at: float | None = None
        self._probing: bool = False

    @property
    def state(self) -> str:
        """Return ``closed``, ``open`` or ``half_open``."""
        if self._opened_at is None:
            return "closed"
        elapsed = self._clock.monotonic() - self._opened_at
        return "half_open" if elapsed >= self._cooldown else "open"

    def check(self) -> None:
        """Raise unless a request may go out.

        Raises:
            CircuitOpenError: Open, or half open with a probe already in flight.
        """
        state = self.state
        if state == "open" or (state == "half_open" and self._probing):
            raise CircuitOpenError()
        self._probing = state == "half_open"

    def record_success(self) -> None:
        """Close the circuit and forget failures."""
        self._failures.clear()
        self._opened_at = None
        self._probing = False

    def record_failure(self, *, immediate: bool = False) -> None:
        """Count a failure and open when the threshold or ``immediate`` says so."""
        now = self._clock.monotonic()
        self._failures = [t for t in self._failures if now - t < self._window] + [now]
        self._probing = False
        if immediate or self.state == "half_open" or len(self._failures) >= self._threshold:
            self._opened_at = now
