"""Background delegation requires explicit grants and a separate service credential."""

# ---- Mocks, fixtures & helpers ---- #
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest
from fantasy_auth.adapters.memory import MemoryConnectionRepo
from fantasy_auth.application.scouting import ScoutingGrants
from fantasy_auth.domain.errors import NeedsReauth
from fantasy_auth.domain.users import LaligaUser
from fantasy_auth.ports.repos import ConnectionRecord

from tests.test_api import client as client
from tests.test_api import container as container


def connection(owner="alice"):
    return ConnectionRecord(
        owner, b"sealed", "policy", "client", "scope", profile=LaligaUser(user_id="manager")
    )


def seed(container):
    asyncio.run(container.credentials._connections.save(connection()))
    container.credentials.get_valid_bearer = AsyncMock(return_value=("private-bearer", 1999999999))
    container.settings.scouting_service_token = "worker-only"


# ---- Happy path ---- #
def test_grant_create_redeem_and_revoke_are_owner_scoped(client, container):
    seed(container)
    headers = {"Authorization": "Bearer alice", "X-Service-Token": "service"}
    url = "/internal/scouting/leagues/l1/grant"
    grant = client.put(url, headers=headers).json()["grant_id"]
    assert client.put(url, headers=headers).json()["grant_id"] == grant
    body = {"grant_id": grant}
    bearer_url = "/internal/scouting/leagues/l1/bearer"
    response = client.post(bearer_url, json=body, headers={"X-Service-Token": "worker-only"})
    assert response.status_code == 200 and response.json()["bearer_token"] == "private-bearer"
    assert "refresh" not in response.text
    client.delete(url, headers={"Authorization": "Bearer bob", "X-Service-Token": "service"})
    assert (
        client.post(bearer_url, json=body, headers={"X-Service-Token": "worker-only"}).status_code
        == 200
    )
    client.delete(url, headers=headers)
    assert (
        client.post(bearer_url, json=body, headers={"X-Service-Token": "worker-only"}).status_code
        == 401
    )


# ---- Error paths ---- #
def test_grant_missing_identity_wrong_service_or_wrong_league_is_rejected(client, container):
    seed(container)
    url = "/internal/scouting/leagues/l1/grant"
    for headers in (
        {},
        {"X-Service-Token": "service"},
        {"Authorization": "Bearer alice"},
        {"Authorization": "Bearer bad", "X-Service-Token": "service"},
    ):
        assert client.put(url, headers=headers).status_code == 401
    headers = {"Authorization": "Bearer alice", "X-Service-Token": "service"}
    grant = client.put(url, headers=headers).json()["grant_id"]
    for token in ("service", "bad", ""):
        assert (
            client.post(
                "/internal/scouting/leagues/l1/bearer",
                json={"grant_id": grant},
                headers={"X-Service-Token": token},
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/internal/scouting/leagues/other/bearer",
            json={"grant_id": grant},
            headers={"X-Service-Token": "worker-only"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/internal/scouting/leagues/l1/bearer",
            json={"grant_id": grant, "user_id": "bob"},
            headers={"X-Service-Token": "worker-only"},
        ).status_code
        == 422
    )
    assert (
        client.put(
            url, headers={"Authorization": "Bearer bob", "X-Service-Token": "service"}
        ).status_code
        == 401
    )


async def test_grants_connection_removed_changed_or_explicitly_revoked_never_resolve():
    connections = MemoryConnectionRepo()
    grants = ScoutingGrants(connections)
    with pytest.raises(NeedsReauth):
        await grants.create("alice", "l1")
    await connections.save(connection())
    grant = await grants.create("alice", "l1")
    await grants.revoke_all("alice")
    with pytest.raises(NeedsReauth):
        await grants.resolve(grant, "l1")
    grant = await grants.create("alice", "l1")
    await connections.delete("alice")
    with pytest.raises(NeedsReauth):
        await grants.resolve(grant, "l1")
    await connections.save(connection())
    grant = await grants.create("alice", "l1")
    await connections.save(
        ConnectionRecord("alice", b"new", "p", "c", "s", profile=LaligaUser(user_id="other"))
    )
    with pytest.raises(NeedsReauth):
        await grants.resolve(grant, "l1")


# ---- Edge cases ---- #
def test_pairing_unlink_revokes_grants_even_before_new_connection(client, container):
    seed(container)
    grant = asyncio.run(container.scouting_grants.create("alice", "l1"))
    assert (
        client.delete("/laliga/connection", headers={"Authorization": "Bearer alice"}).status_code
        == 200
    )
    assert (
        client.post(
            "/internal/scouting/leagues/l1/bearer",
            json={"grant_id": grant},
            headers={"X-Service-Token": "worker-only"},
        ).status_code
        == 401
    )


async def test_postgres_grants_persist_scope_and_cascade_on_connection_change():
    import os
    from uuid import uuid4

    import asyncpg
    from fantasy_auth.adapters.postgres import PostgresConnectionRepo
    from fantasy_auth.migrate import apply_migrations

    dsn = os.environ.get("AUTH_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("AUTH_TEST_DATABASE_URL requires disposable PostgreSQL")
    schema = "grants_test_" + uuid4().hex
    admin = await asyncpg.connect(dsn)
    await admin.execute(f'CREATE SCHEMA "{schema}"')
    pool = await asyncpg.create_pool(dsn, server_settings={"search_path": schema})
    try:
        await apply_migrations(pool)
        await apply_migrations(pool)
        repo = PostgresConnectionRepo(pool)
        grants = ScoutingGrants(repo, pool)
        await repo.save(connection())
        grant = await grants.create("alice", "l1")
        assert await grants.create("alice", "l1") == grant
        assert await grants.resolve(grant, "l1") == "alice"
        with pytest.raises(NeedsReauth):
            await grants.resolve(grant, "l2")
        await grants.revoke("bob", "l1")
        assert await grants.resolve(grant, "l1") == "alice"
        await grants.revoke("alice", "l1")
        with pytest.raises(NeedsReauth):
            await grants.resolve(grant, "l1")
        grant = await grants.create("alice", "l1")
        await repo.delete("alice")
        with pytest.raises(NeedsReauth):
            await grants.resolve(grant, "l1")
        await repo.save(connection())
        grant = await grants.create("alice", "l1")
        await grants.revoke_all("alice")
        with pytest.raises(NeedsReauth):
            await grants.resolve(grant, "l1")
    finally:
        await pool.close()
        await admin.execute(f'DROP SCHEMA "{schema}" CASCADE')
        await admin.close()


def test_browser_scouting_analysis_is_typed_and_does_not_require_pairing():
    import httpx
    from fantasy_auth.cli.browser_session.args import needs_laliga, parse_args
    from fantasy_auth.cli.browser_session.flows import run_scouting_analysis

    args = parse_args(["scouting-analysis", "--league-id", "l1", "--json"])
    assert not needs_laliga(args)
    calls = []

    def handle(request):
        calls.append(request)
        assert request.method == "GET" and request.headers["authorization"] == "Bearer app-jwt"
        assert request.url.params["league_id"] == "l1"
        return httpx.Response(
            200,
            json=(
                {"favorites": [], "status": "inactive", "checkedAt": None}
                if request.url.path.endswith("favorites")
                else {"notifications": [], "unreadCount": 0, "nextCursor": None}
            ),
        )

    result = run_scouting_analysis(
        api_base="http://api", jwt="app-jwt", league_id="l1", transport=httpx.MockTransport(handle)
    )
    assert result["favorites"]["favorites"] == [] and len(calls) == 2


def test_redeem_explicit_unauthorized_retry_uses_auth_owned_refresh(client, container):
    seed(container)
    container.credentials.retry_after_unauthorized = AsyncMock(return_value="refreshed")
    grant = client.put(
        "/internal/scouting/leagues/l1/grant",
        headers={"Authorization": "Bearer alice", "X-Service-Token": "service"},
    ).json()["grant_id"]
    response = client.post(
        "/internal/scouting/leagues/l1/bearer",
        json={"grant_id": grant, "retry_unauthorized": True},
        headers={"X-Service-Token": "worker-only"},
    )
    assert response.status_code == 200
    container.credentials.retry_after_unauthorized.assert_awaited_once_with("alice")
