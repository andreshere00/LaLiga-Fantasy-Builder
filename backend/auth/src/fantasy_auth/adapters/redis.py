"""Redis adapters for rate limiting and distributed refresh locks."""

from __future__ import annotations

import time
import uuid

from redis.asyncio import Redis

_SLIDING_WINDOW_LUA = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  return 0
end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, window)
return 1
"""


class RedisRateLimiter:
    """Redis sliding-window rate limiter."""

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def allow(self, key: str, *, limit: int, window_seconds: int) -> bool:
        """Return True if the key is under the limit for the window.

        Args:
            key: Rate-limit bucket key (e.g. client IP).
            limit: Max allowed events in the window.
            window_seconds: Window size in seconds.

        Returns:
            True when the request is allowed.
        """
        now = time.time()
        member = f"{now}:{uuid.uuid4().hex}"
        result = await self._redis.eval(
            _SLIDING_WINDOW_LUA,
            1,
            f"ratelimit:{key}",
            str(now),
            str(window_seconds),
            str(limit),
            member,
        )
        return bool(int(result))


class RedisRefreshLock:
    """Redis SET NX EX lock for per-user token refresh."""

    def __init__(self, redis: Redis) -> None:
        self._redis = redis
        self._tokens: dict[str, str] = {}

    def _key(self, user_id: str) -> str:
        return f"refresh-lock:{user_id}"

    async def acquire(self, user_id: str, *, ttl_seconds: int = 30) -> bool:
        """Try to acquire the refresh lock for ``user_id``.

        Args:
            user_id: Application user ID.
            ttl_seconds: Lock expiry to avoid deadlocks.

        Returns:
            True when the lock was acquired.
        """
        token = uuid.uuid4().hex
        ok = await self._redis.set(
            self._key(user_id),
            token,
            nx=True,
            ex=ttl_seconds,
        )
        if ok:
            self._tokens[user_id] = token
        return bool(ok)

    async def release(self, user_id: str) -> None:
        """Release the refresh lock for ``user_id``.

        Args:
            user_id: Application user ID.
        """
        token = self._tokens.pop(user_id, None)
        if token is None:
            await self._redis.delete(self._key(user_id))
            return
        current = await self._redis.get(self._key(user_id))
        if current == token or (isinstance(current, bytes) and current.decode() == token):
            await self._redis.delete(self._key(user_id))


class MemoryRefreshLock:
    """In-process refresh lock for memory-mode / tests."""

    def __init__(self) -> None:
        self._held: set[str] = set()

    async def acquire(self, user_id: str, *, ttl_seconds: int = 30) -> bool:
        """Acquire a process-local lock.

        Args:
            user_id: Application user ID.
            ttl_seconds: Ignored for memory mode.

        Returns:
            True when the lock was acquired.
        """
        del ttl_seconds
        if user_id in self._held:
            return False
        self._held.add(user_id)
        return True

    async def release(self, user_id: str) -> None:
        """Release a process-local lock.

        Args:
            user_id: Application user ID.
        """
        self._held.discard(user_id)
