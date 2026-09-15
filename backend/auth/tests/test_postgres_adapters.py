# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import pytest
from fantasy_auth.adapters import postgres as pg
from fantasy_auth.adapters.postgres import (
    PostgresConnectionRepo,
    PostgresPairingStore,
    PostgresSessionStore,
)
from fantasy_auth.domain.users import AppUser, LaligaUser
from fantasy_auth.ports.repos import ConnectionRecord, PairingRecord, SessionRecord

NOW = 1_700_000_000


class FakeRow(dict[str, Any]):
    """Dict subclass supporting ``row["key"]`` like asyncpg.Record."""


class FakePool:
    """Pool stub that records execute/fetchrow and returns configured rows."""

    def __init__(self) -> None:
        self.execute_calls: list[tuple[str, tuple[Any, ...]]] = []
        self.fetchrow_calls: list[tuple[str, tuple[Any, ...]]] = []
        self.fetchrow_result: FakeRow | None = None

    async def execute(self, query: str, *args: Any) -> str:
        self.execute_calls.append((query, args))
        return "OK"

    async def fetchrow(self, query: str, *args: Any) -> FakeRow | None:
        self.fetchrow_calls.append((query, args))
        return self.fetchrow_result


# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_session_store_save_and_get_with_user() -> None:
    # Arrange
    pool = FakePool()
    store = PostgresSessionStore(pool)  # type: ignore[arg-type]
    session = SessionRecord(
        session_id="s1",
        user=AppUser(user_id="u1", email="a@b.c", name="Ann"),
        csrf_token="csrf",
        expires_at=NOW + 100,
        oidc_state="st",
        oidc_nonce="nn",
        oidc_code_verifier="cv",
    )

    # Act
    await store.save(session)
    pool.fetchrow_result = FakeRow(
        {
            "session_id": "s1",
            "user_id": "u1",
            "email": "a@b.c",
            "name": "Ann",
            "csrf_token": "csrf",
            "expires_at": datetime.fromtimestamp(NOW + 100, tz=UTC),
            "oidc_state": "st",
            "oidc_nonce": "nn",
            "oidc_code_verifier": "cv",
        }
    )
    loaded = await store.get("s1")

    # Assert
    assert len(pool.execute_calls) == 1
    assert "INSERT INTO sessions" in pool.execute_calls[0][0]
    assert loaded is not None
    assert loaded.session_id == "s1"
    assert loaded.user == AppUser(user_id="u1", email="a@b.c", name="Ann")
    assert loaded.expires_at == NOW + 100
    assert loaded.oidc_state == "st"


@pytest.mark.asyncio
async def test_session_store_get_without_user_and_delete() -> None:
    # Arrange
    pool = FakePool()
    store = PostgresSessionStore(pool)  # type: ignore[arg-type]
    pool.fetchrow_result = FakeRow(
        {
            "session_id": "s2",
            "user_id": None,
            "email": None,
            "name": None,
            "csrf_token": "c",
            "expires_at": datetime.fromtimestamp(NOW, tz=UTC),
            "oidc_state": None,
            "oidc_nonce": None,
            "oidc_code_verifier": None,
        }
    )

    # Act
    loaded = await store.get("s2")
    await store.delete("s2")

    # Assert
    assert loaded is not None
    assert loaded.user is None
    assert pool.execute_calls[-1][1] == ("s2",)
    assert "DELETE FROM sessions" in pool.execute_calls[-1][0]


@pytest.mark.asyncio
async def test_session_store_get_missing_returns_none() -> None:
    # Arrange
    pool = FakePool()
    store = PostgresSessionStore(pool)  # type: ignore[arg-type]
    pool.fetchrow_result = None

    # Act
    loaded = await store.get("missing")

    # Assert
    assert loaded is None


@pytest.mark.asyncio
async def test_pairing_store_save_get_and_consume() -> None:
    # Arrange
    pool = FakePool()
    store = PostgresPairingStore(pool)  # type: ignore[arg-type]
    pairing = PairingRecord(
        pairing_id="p1",
        user_id="u1",
        secret_hash="abc",
        expires_at=NOW + 60,
        consumed=False,
        nonce="n1",
    )
    expires_dt = datetime.fromtimestamp(NOW + 60, tz=UTC)

    # Act
    await store.save(pairing)
    pool.fetchrow_result = FakeRow(
        {
            "id": "p1",
            "user_id": "u1",
            "secret_hash": "abc",
            "expires_at": expires_dt,
            "consumed": False,
            "nonce": "n1",
        }
    )
    got = await store.get("p1")
    pool.fetchrow_result = FakeRow(
        {
            "id": "p1",
            "user_id": "u1",
            "secret_hash": "abc",
            "expires_at": expires_dt,
            "nonce": "n1",
            "consumed": True,
        }
    )
    consumed = await store.consume("p1", now=NOW)

    # Assert
    assert got is not None
    assert got.pairing_id == "p1"
    assert got.consumed is False
    assert consumed is not None
    assert consumed.consumed is False
    assert "UPDATE pairings" in pool.fetchrow_calls[-1][0]


@pytest.mark.asyncio
async def test_pairing_store_get_and_consume_missing_return_none() -> None:
    # Arrange
    pool = FakePool()
    store = PostgresPairingStore(pool)  # type: ignore[arg-type]
    pool.fetchrow_result = None

    # Act
    got = await store.get("missing")
    consumed = await store.consume("missing", now=NOW)

    # Assert
    assert got is None
    assert consumed is None


@pytest.mark.asyncio
async def test_connection_repo_save_get_with_profile_and_delete() -> None:
    # Arrange
    pool = FakePool()
    repo = PostgresConnectionRepo(pool)  # type: ignore[arg-type]
    profile = LaligaUser(user_id="mgr-1", manager_name="El Manager", email="m@x.c")
    connection = ConnectionRecord(
        user_id="u1",
        sealed_blob=b"\x01sealed",
        policy="pol",
        client_id="cid",
        scope="openid",
        needs_reauth=False,
        profile=profile,
    )

    # Act
    await repo.save(connection)
    saved_args = pool.execute_calls[0][1]
    pool.fetchrow_result = FakeRow(
        {
            "user_id": "u1",
            "sealed_blob": memoryview(b"\x01sealed"),
            "policy": "pol",
            "client_id": "cid",
            "scope": "openid",
            "needs_reauth": False,
            "profile_json": {
                "authenticated": True,
                "user_id": "mgr-1",
                "manager_name": "El Manager",
                "email": "m@x.c",
            },
        }
    )
    loaded = await repo.get("u1")
    await repo.delete("u1")

    # Assert
    assert saved_args[0] == "u1"
    assert saved_args[1] == b"\x01sealed"
    assert isinstance(saved_args[6], str)
    assert json.loads(saved_args[6])["manager_name"] == "El Manager"
    assert loaded is not None
    assert loaded.sealed_blob == b"\x01sealed"
    assert loaded.profile is not None
    assert loaded.profile.manager_name == "El Manager"
    assert "DELETE FROM connections" in pool.execute_calls[-1][0]


@pytest.mark.asyncio
async def test_connection_repo_get_missing_and_null_profile() -> None:
    # Arrange
    pool = FakePool()
    repo = PostgresConnectionRepo(pool)  # type: ignore[arg-type]
    pool.fetchrow_result = None
    missing = await repo.get("nope")

    pool.fetchrow_result = FakeRow(
        {
            "user_id": "u2",
            "sealed_blob": b"blob",
            "policy": "p",
            "client_id": "c",
            "scope": "s",
            "needs_reauth": True,
            "profile_json": None,
        }
    )

    # Act
    loaded = await repo.get("u2")
    await repo.save(
        ConnectionRecord(
            user_id="u2",
            sealed_blob=b"blob",
            policy="p",
            client_id="c",
            scope="s",
            needs_reauth=True,
            profile=None,
        )
    )

    # Assert
    assert missing is None
    assert loaded is not None
    assert loaded.profile is None
    assert loaded.needs_reauth is True
    assert pool.execute_calls[-1][1][6] is None


# ---- Edge cases ---- #


def test_from_dt_naive_assumes_utc() -> None:
    # Arrange
    naive = datetime(2023, 11, 14, 22, 13, 20)

    # Act
    ts = pg._from_dt(naive)  # noqa: SLF001

    # Assert
    assert ts == int(naive.replace(tzinfo=UTC).timestamp())


def test_to_dt_returns_aware_utc() -> None:
    # Arrange / Act
    value = pg._to_dt(NOW)  # noqa: SLF001

    # Assert
    assert value.tzinfo is not None
    assert int(value.timestamp()) == NOW


def test_profile_roundtrip_none_dict_and_json_str() -> None:
    # Arrange
    profile = LaligaUser(sub="s", oid="o", manager_name="M")

    # Act
    as_none = pg._profile_to_json(None)  # noqa: SLF001
    as_json = pg._profile_to_json(profile)  # noqa: SLF001
    from_none = pg._profile_from_json(None)  # noqa: SLF001
    from_dict = pg._profile_from_json(json.loads(as_json or "{}"))  # noqa: SLF001
    from_str = pg._profile_from_json(as_json)  # noqa: SLF001

    # Assert
    assert as_none is None
    assert from_none is None
    assert from_dict is not None
    assert from_dict.manager_name == "M"
    assert from_str is not None
    assert from_str.sub == "s"
    assert from_str.oid == "o"
