"""Native pairing storage and advisory-lock behavior across workers."""

# ---- Mocks, fixtures & helpers ---- #
import asyncio
import os
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest
from fantasy_auth.adapters.memory import MemoryBrowserPairingStore
from fantasy_auth.adapters.postgres import PostgresBrowserPairingStore, PostgresRefreshLock
from fantasy_auth.ports.repos import BrowserPairingRecord


@pytest.fixture
async def postgres_pool():
    dsn = os.environ.get("AUTH_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("AUTH_TEST_DATABASE_URL requires a disposable PostgreSQL database")
    schema = "pairing_test_" + uuid4().hex
    admin = await asyncpg.connect(dsn)
    await admin.execute(f'CREATE SCHEMA "{schema}"')
    pool = await asyncpg.create_pool(
        dsn, min_size=1, max_size=10, server_settings={"search_path": schema}
    )
    try:
        for path in sorted((Path(__file__).parents[1] / "migrations").glob("*.sql")):
            await pool.execute(path.read_text())
        yield pool
    finally:
        await pool.close()
        await admin.execute(f'DROP SCHEMA "{schema}" CASCADE')
        await admin.close()


async def exercise_store(store):
    record = BrowserPairingRecord("state-a", "alice", "pairing-a", "secret", "verifier", 200)
    await store.save(record, now=100)
    await store.cancel("bob")
    results = await asyncio.gather(*[store.consume("state-a", now=100) for _ in range(8)])
    assert sum(value is not None for value in results) == 1
    assert next(value for value in results if value).user_id == "alice"
    await store.save(record, now=100)
    await store.cancel("alice")
    assert await store.consume("state-a", now=100) is None
    await store.save(record, now=100)
    assert await store.consume("state-a", now=200) is None


# ---- Happy path ---- #
@pytest.mark.asyncio
async def test_browser_pairing_memory_replay_expiry_and_owner_cancellation():
    await exercise_store(MemoryBrowserPairingStore())


@pytest.mark.asyncio
async def test_browser_pairing_postgres_replay_expiry_and_owner_cancellation(postgres_pool):
    await postgres_pool.execute(
        "INSERT INTO pairings(id, user_id, secret_hash, expires_at) "
        "VALUES ('pairing-a', 'alice', 'hash', to_timestamp(200))"
    )
    await exercise_store(PostgresBrowserPairingStore(postgres_pool))


# ---- Error paths ---- #
@pytest.mark.asyncio
async def test_refresh_lock_two_workers_cannot_mutate_same_owner(postgres_pool):
    first = PostgresRefreshLock(postgres_pool)
    second = PostgresRefreshLock(postgres_pool)
    assert await first.acquire("alice")
    assert not await second.acquire("alice")
    # A failed acquire/release from another worker cannot unlock the owner.
    await second.release("alice")
    assert not await second.acquire("alice")
    assert await second.acquire("bob")
    await second.release("bob")
    await first.release("alice")
    assert await second.acquire("alice")
    await second.release("alice")


# ---- Edge cases ---- #
@pytest.mark.asyncio
async def test_refresh_lock_pool_capacity_keeps_repository_queries_available(postgres_pool):
    lock = PostgresRefreshLock(postgres_pool)
    for user in ("one", "two", "three", "four"):
        assert await lock.acquire(user)
    assert not await lock.acquire("five")
    assert await asyncio.wait_for(postgres_pool.fetchval("SELECT 1"), timeout=2) == 1
    for user in ("one", "two", "three", "four"):
        await lock.release(user)
    assert await lock.acquire("five")
    await lock.release("five")
