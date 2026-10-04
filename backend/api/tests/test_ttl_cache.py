# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import asyncio

import pytest
from fantasy_api.domain.ttl_cache import AsyncTtlCache

# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_get_or_fetch_caches_value_until_ttl_expires() -> None:
    cache: AsyncTtlCache[int] = AsyncTtlCache(ttl_seconds=60.0)
    calls = 0

    async def fetch() -> int:
        nonlocal calls
        calls += 1
        return 42

    first = await cache.get_or_fetch(fetch)
    second = await cache.get_or_fetch(fetch)
    assert first == 42
    assert second == 42
    assert calls == 1


@pytest.mark.asyncio
async def test_get_or_fetch_single_flights_concurrent_misses() -> None:
    cache: AsyncTtlCache[int] = AsyncTtlCache(ttl_seconds=60.0)
    calls = 0
    started = asyncio.Event()

    async def fetch() -> int:
        nonlocal calls
        calls += 1
        started.set()
        await asyncio.sleep(0.05)
        return 7

    tasks = [asyncio.create_task(cache.get_or_fetch(fetch)) for _ in range(3)]
    await started.wait()
    values = await asyncio.gather(*tasks)
    assert values == [7, 7, 7]
    assert calls == 1


# ---- Edge cases ---- #


@pytest.mark.asyncio
async def test_clear_drops_cached_value() -> None:
    cache: AsyncTtlCache[int] = AsyncTtlCache(ttl_seconds=60.0)
    calls = 0

    async def fetch() -> int:
        nonlocal calls
        calls += 1
        return calls

    await cache.get_or_fetch(fetch)
    cache.clear()
    again = await cache.get_or_fetch(fetch)
    assert again == 2
    assert calls == 2
