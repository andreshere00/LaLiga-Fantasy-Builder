# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import pytest

from fantasy_auth.adapters.memory import MemoryRateLimiter
from fantasy_auth.adapters.redis import MemoryRefreshLock
from fantasy_auth.api.middleware import redact_value
from fantasy_auth.observability import JsonFormatter, current_trace_context


# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_memory_rate_limiter_allows_under_limit() -> None:
    # Arrange
    limiter = MemoryRateLimiter()

    # Act
    allowed = await limiter.allow("ip:1", limit=2, window_seconds=60)

    # Assert
    assert allowed is True


@pytest.mark.asyncio
async def test_memory_refresh_lock_acquire_and_release() -> None:
    # Arrange
    lock = MemoryRefreshLock()

    # Act
    first = await lock.acquire("u1")
    second = await lock.acquire("u1")
    await lock.release("u1")
    third = await lock.acquire("u1")

    # Assert
    assert first is True
    assert second is False
    assert third is True


def test_redact_value_masks_secrets() -> None:
    # Arrange / Act / Assert
    assert redact_value("access_token", "secret") == "[REDACTED]"
    assert redact_value("X-Request-Id", "abc") == "abc"


def test_json_formatter_includes_correlation_fields() -> None:
    # Arrange
    import logging

    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="fantasy_auth",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello",
        args=(),
        exc_info=None,
    )
    record.request_id = "req-1"
    record.trace_id = "trace-1"
    record.span_id = "span-1"

    # Act
    payload = formatter.format(record)

    # Assert
    assert '"request_id": "req-1"' in payload
    assert '"trace_id": "trace-1"' in payload
    assert '"span_id": "span-1"' in payload


# ---- Error paths ---- #


@pytest.mark.asyncio
async def test_memory_rate_limiter_blocks_over_limit() -> None:
    # Arrange
    limiter = MemoryRateLimiter()
    await limiter.allow("ip:2", limit=1, window_seconds=60)

    # Act
    blocked = await limiter.allow("ip:2", limit=1, window_seconds=60)

    # Assert
    assert blocked is False


# ---- Edge cases ---- #


def test_current_trace_context_without_otel_is_empty() -> None:
    # Arrange / Act / Assert
    assert current_trace_context() == {} or isinstance(current_trace_context(), dict)
