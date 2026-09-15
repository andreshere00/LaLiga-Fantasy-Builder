"""Ordered SQL migration runner with a Postgres advisory lock."""

from __future__ import annotations

from pathlib import Path

import asyncpg

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
ADVISORY_LOCK_KEY = 0xFA47A501


async def apply_migrations(pool: asyncpg.Pool) -> list[str]:
    """Apply pending ``*.sql`` files in lexical order.

    Args:
        pool: Asyncpg connection pool.

    Returns:
        List of newly applied migration version names.
    """
    applied: list[str] = []
    async with pool.acquire() as conn:
        async with conn.transaction():
            locked = await conn.fetchval(
                "SELECT pg_try_advisory_xact_lock($1)",
                ADVISORY_LOCK_KEY,
            )
            if not locked:
                return applied

            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            existing = {
                row["version"]
                for row in await conn.fetch("SELECT version FROM schema_migrations")
            }
            for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
                version = path.name
                if version in existing:
                    continue
                sql = path.read_text(encoding="utf-8")
                await conn.execute(sql)
                await conn.execute(
                    "INSERT INTO schema_migrations (version) VALUES ($1)",
                    version,
                )
                applied.append(version)
    return applied
