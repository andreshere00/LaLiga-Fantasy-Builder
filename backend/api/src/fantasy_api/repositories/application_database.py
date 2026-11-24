"""Shared PostgreSQL pool and ordered migrations for application-owned storage."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import asyncpg

from fantasy_api.domain.errors import UpstreamError


class ApplicationDatabase:
    """Own a separate application pool; never fall back to volatile storage."""

    def __init__(self, database_url: str, label: str) -> None:
        self._url = database_url
        self._label = label
        self._pool: Any = None
        self._init_lock = asyncio.Lock()

    async def start(self) -> None:
        """Connect and apply ordered migrations under a database lock."""
        if self._pool is not None:
            return
        if not self._url:
            raise UpstreamError(f"{self._label} storage is not configured", status_code=503)
        async with self._init_lock:
            if self._pool is not None:
                return
            try:
                pool = await asyncpg.create_pool(self._url, min_size=1, max_size=5)
            except (OSError, asyncpg.PostgresError) as exc:
                raise UpstreamError(f"{self._label} storage unavailable", status_code=503) from exc
            try:
                async with pool.acquire() as conn, conn.transaction():
                    await conn.execute("SELECT pg_advisory_xact_lock(18271301)")
                    await conn.execute(
                        "CREATE TABLE IF NOT EXISTS schema_migrations "
                        "(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())"
                    )
                    for path in sorted((Path(__file__).parents[1] / "migrations").glob("*.sql")):
                        if not await conn.fetchval(
                            "SELECT 1 FROM schema_migrations WHERE version=$1", path.name
                        ):
                            await conn.execute(path.read_text())
                            await conn.execute(
                                "INSERT INTO schema_migrations(version) VALUES ($1)", path.name
                            )
            except BaseException:
                await pool.close()
                raise
            self._pool = pool

    async def aclose(self) -> None:
        """Close application connections."""
        if self._pool is not None:
            await self._pool.close()

    async def ready(self) -> None:
        """Check the application database without returning connection details."""
        await self.start()
        try:
            await self._pool.fetchval("SELECT 1")
        except (OSError, asyncpg.PostgresError) as exc:
            raise UpstreamError(f"{self._label} storage unavailable", status_code=503) from exc
