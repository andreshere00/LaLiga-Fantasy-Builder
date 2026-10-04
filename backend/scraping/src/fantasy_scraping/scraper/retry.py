"""Retry classification and backoff."""

import random

RETRYABLE_STATUSES: frozenset[int] = frozenset({408, 425, 500, 502, 503, 504})
MAX_BACKOFF_S: float = 30
MAX_RETRY_AFTER_S: float = 60
DEFAULT_429_WAIT_S: float = 10


def backoff_delay(attempt: int, rng: random.Random) -> float:
    """Return a full-jitter delay.

    Args:
        attempt: Zero-based attempt that just failed.
        rng: Random source.

    Returns:
        Seconds in ``[0, min(30, 2 ** attempt)]``.
    """
    return rng.uniform(0, min(MAX_BACKOFF_S, 2.0**attempt))


def retry_after(header: str | None, default: float) -> float:
    """Parse a numeric ``Retry-After`` capped at 60 s, falling back to ``default``."""
    try:
        return min(MAX_RETRY_AFTER_S, max(0.0, float(header))) if header else default
    except ValueError:
        return default
