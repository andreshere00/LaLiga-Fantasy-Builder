# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pytest
from fantasy_auth import migrate as migrate_mod


class FakeConnection:
    """Asyncpg-like connection that records SQL and returns stub rows."""

    def __init__(self, *, locked: bool, existing: list[str] | None = None) -> None:
        self.locked = locked
        self.existing = set(existing or [])
        self.executed: list[str] = []
        self.inserted: list[str] = []

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[FakeConnection]:
        yield self

    async def fetchval(self, query: str, *args: Any) -> bool:
        del args
        assert "pg_try_advisory_xact_lock" in query
        return self.locked

    async def execute(self, query: str, *args: Any) -> str:
        self.executed.append(query.strip())
        if "INSERT INTO schema_migrations" in query and args:
            self.inserted.append(str(args[0]))
            self.existing.add(str(args[0]))
        return "OK"

    async def fetch(self, query: str, *args: Any) -> list[dict[str, str]]:
        del args
        assert "schema_migrations" in query
        return [{"version": v} for v in sorted(self.existing)]


class FakePool:
    """Pool that yields a single fake connection via acquire()."""

    def __init__(self, conn: FakeConnection) -> None:
        self.conn = conn

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[FakeConnection]:
        yield self.conn


# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_apply_migrations_lock_true_applies_sql_files(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    (tmp_path / "001_init.sql").write_text("CREATE TABLE t1 (id INT);", encoding="utf-8")
    (tmp_path / "002_add.sql").write_text("CREATE TABLE t2 (id INT);", encoding="utf-8")
    monkeypatch.setattr(migrate_mod, "MIGRATIONS_DIR", tmp_path)
    conn = FakeConnection(locked=True, existing=[])
    pool = FakePool(conn)

    # Act
    applied = await migrate_mod.apply_migrations(pool)  # type: ignore[arg-type]

    # Assert
    assert applied == ["001_init.sql", "002_add.sql"]
    assert conn.inserted == ["001_init.sql", "002_add.sql"]
    assert any("CREATE TABLE IF NOT EXISTS schema_migrations" in q for q in conn.executed)
    assert any("CREATE TABLE t1" in q for q in conn.executed)
    assert any("CREATE TABLE t2" in q for q in conn.executed)


@pytest.mark.asyncio
async def test_apply_migrations_second_run_skips_existing_versions(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    (tmp_path / "001_init.sql").write_text("CREATE TABLE t1 (id INT);", encoding="utf-8")
    (tmp_path / "002_add.sql").write_text("CREATE TABLE t2 (id INT);", encoding="utf-8")
    monkeypatch.setattr(migrate_mod, "MIGRATIONS_DIR", tmp_path)
    conn = FakeConnection(locked=True, existing=["001_init.sql"])
    pool = FakePool(conn)

    # Act
    applied = await migrate_mod.apply_migrations(pool)  # type: ignore[arg-type]

    # Assert
    assert applied == ["002_add.sql"]
    assert conn.inserted == ["002_add.sql"]
    assert not any("CREATE TABLE t1" in q for q in conn.executed)
    assert any("CREATE TABLE t2" in q for q in conn.executed)


# ---- Error paths ---- #


@pytest.mark.asyncio
async def test_apply_migrations_lock_false_returns_empty(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    (tmp_path / "001_init.sql").write_text("SELECT 1;", encoding="utf-8")
    monkeypatch.setattr(migrate_mod, "MIGRATIONS_DIR", tmp_path)
    conn = FakeConnection(locked=False)
    pool = FakePool(conn)

    # Act
    applied = await migrate_mod.apply_migrations(pool)  # type: ignore[arg-type]

    # Assert
    assert applied == []
    assert conn.executed == []
    assert conn.inserted == []
