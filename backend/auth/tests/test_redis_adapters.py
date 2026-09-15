# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from fantasy_auth.adapters.redis import RedisRateLimiter, RedisRefreshLock


class FakeRedis:
    """Minimal async Redis stub for rate-limit and lock tests."""

    def __init__(self) -> None:
        self.eval_result: int = 1
        self.set_result: bool | None = True
        self.get_result: str | bytes | None = None
        self.eval_calls: list[tuple[Any, ...]] = []
        self.set_calls: list[dict[str, Any]] = []
        self.delete_calls: list[str] = []
        self.get_calls: list[str] = []

    async def eval(self, *args: Any) -> int:
        self.eval_calls.append(args)
        return self.eval_result

    async def set(
        self,
        key: str,
        value: str,
        *,
        nx: bool = False,
        ex: int | None = None,
    ) -> bool | None:
        self.set_calls.append({"key": key, "value": value, "nx": nx, "ex": ex})
        return self.set_result

    async def get(self, key: str) -> str | bytes | None:
        self.get_calls.append(key)
        return self.get_result

    async def delete(self, key: str) -> int:
        self.delete_calls.append(key)
        return 1


# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_allow_eval_returns_one_allows() -> None:
    # Arrange
    redis = FakeRedis()
    redis.eval_result = 1
    limiter = RedisRateLimiter(redis)  # type: ignore[arg-type]

    # Act
    allowed = await limiter.allow("10.0.0.1", limit=5, window_seconds=60)

    # Assert
    assert allowed is True
    assert len(redis.eval_calls) == 1
    assert redis.eval_calls[0][2] == "ratelimit:10.0.0.1"


@pytest.mark.asyncio
async def test_allow_eval_returns_zero_denies() -> None:
    # Arrange
    redis = FakeRedis()
    redis.eval_result = 0
    limiter = RedisRateLimiter(redis)  # type: ignore[arg-type]

    # Act
    allowed = await limiter.allow("10.0.0.1", limit=1, window_seconds=10)

    # Assert
    assert allowed is False


@pytest.mark.asyncio
async def test_acquire_set_nx_true_stores_token() -> None:
    # Arrange
    redis = FakeRedis()
    redis.set_result = True
    lock = RedisRefreshLock(redis)  # type: ignore[arg-type]

    # Act
    acquired = await lock.acquire("user-1", ttl_seconds=15)

    # Assert
    assert acquired is True
    assert redis.set_calls[0]["key"] == "refresh-lock:user-1"
    assert redis.set_calls[0]["nx"] is True
    assert redis.set_calls[0]["ex"] == 15
    assert "user-1" in lock._tokens  # noqa: SLF001


@pytest.mark.asyncio
async def test_acquire_set_nx_false_skips_token() -> None:
    # Arrange
    redis = FakeRedis()
    redis.set_result = False
    lock = RedisRefreshLock(redis)  # type: ignore[arg-type]

    # Act
    acquired = await lock.acquire("user-1")

    # Assert
    assert acquired is False
    assert "user-1" not in lock._tokens  # noqa: SLF001


# ---- Error paths / release paths ---- #


@pytest.mark.asyncio
async def test_release_no_local_token_deletes_key() -> None:
    # Arrange
    redis = FakeRedis()
    lock = RedisRefreshLock(redis)  # type: ignore[arg-type]

    # Act
    await lock.release("user-1")

    # Assert
    assert redis.delete_calls == ["refresh-lock:user-1"]
    assert redis.get_calls == []


@pytest.mark.asyncio
async def test_release_token_match_str_deletes() -> None:
    # Arrange
    redis = FakeRedis()
    redis.set_result = True
    lock = RedisRefreshLock(redis)  # type: ignore[arg-type]
    await lock.acquire("user-1")
    local_token = lock._tokens["user-1"]  # noqa: SLF001
    redis.get_result = local_token

    # Act
    await lock.release("user-1")

    # Assert
    assert redis.delete_calls == ["refresh-lock:user-1"]
    assert "user-1" not in lock._tokens  # noqa: SLF001


@pytest.mark.asyncio
async def test_release_token_match_bytes_deletes() -> None:
    # Arrange
    redis = FakeRedis()
    redis.set_result = True
    lock = RedisRefreshLock(redis)  # type: ignore[arg-type]
    await lock.acquire("user-1")
    local_token = lock._tokens["user-1"]  # noqa: SLF001
    redis.get_result = local_token.encode()

    # Act
    await lock.release("user-1")

    # Assert
    assert redis.delete_calls == ["refresh-lock:user-1"]


@pytest.mark.asyncio
async def test_release_token_mismatch_skips_delete() -> None:
    # Arrange
    redis = FakeRedis()
    redis.set_result = True
    lock = RedisRefreshLock(redis)  # type: ignore[arg-type]
    await lock.acquire("user-1")
    redis.get_result = "other-holder-token"

    # Act
    await lock.release("user-1")

    # Assert
    assert redis.delete_calls == []
    assert redis.get_calls == ["refresh-lock:user-1"]


# ---- Edge cases ---- #


@pytest.mark.asyncio
async def test_allow_uses_async_mock_eval() -> None:
    # Arrange
    redis = AsyncMock()
    redis.eval = AsyncMock(return_value=1)
    limiter = RedisRateLimiter(redis)

    # Act
    allowed = await limiter.allow("ip", limit=3, window_seconds=30)

    # Assert
    assert allowed is True
    redis.eval.assert_awaited_once()
