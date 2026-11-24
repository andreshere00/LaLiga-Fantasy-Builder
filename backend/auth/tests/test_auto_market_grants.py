"""Auto-market write delegation requires explicit grants and its own service credential."""

# ---- Mocks, fixtures & helpers ---- #
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest
from fantasy_auth.adapters.memory import MemoryConnectionRepo
from fantasy_auth.application import auto_market
from fantasy_auth.application.auto_market import AutoMarketGrants
from fantasy_auth.domain.errors import NeedsReauth
from fantasy_auth.domain.users import LaligaUser
from fantasy_auth.ports.repos import ConnectionRecord

from tests.test_api import client as client
from tests.test_api import container as container

URL = "/internal/auto-market/leagues/l1"
USER = {"Authorization": "Bearer alice", "X-Service-Token": "service"}
WORKER = {"X-Service-Token": "write-worker"}


def connection(owner="alice"):
    return ConnectionRecord(
        owner, b"sealed", "policy", "client", "scope", profile=LaligaUser(user_id="manager")
    )


def seed(container):
    asyncio.run(container.credentials._connections.save(connection()))
    container.credentials.get_valid_bearer = AsyncMock(return_value=("private-bearer", 1999999999))
    container.settings.scouting_service_token = "read-worker"
    container.settings.auto_market_service_token = "write-worker"


# ---- Happy path ---- #
def test_grant_create_redeem_and_revoke_are_owner_scoped(client, container):
    seed(container)
    grant = client.put(f"{URL}/grant", headers=USER).json()["grant_id"]
    assert client.put(f"{URL}/grant", headers=USER).json()["grant_id"] == grant
    body = {"grant_id": grant}
    response = client.post(f"{URL}/bearer", json=body, headers=WORKER)
    assert response.status_code == 200 and response.json()["bearer_token"] == "private-bearer"
    assert "refresh" not in response.text
    client.delete(
        f"{URL}/grant", headers={"Authorization": "Bearer bob", "X-Service-Token": "service"}
    )
    assert client.post(f"{URL}/bearer", json=body, headers=WORKER).status_code == 200
    client.delete(f"{URL}/grant", headers=USER)
    assert client.post(f"{URL}/bearer", json=body, headers=WORKER).status_code == 401


# ---- Error paths ---- #
def test_grant_missing_identity_wrong_service_or_wrong_league_is_rejected(client, container):
    seed(container)
    for headers in (
        {},
        {"X-Service-Token": "service"},
        {"Authorization": "Bearer alice"},
        {"Authorization": "Bearer bad", "X-Service-Token": "service"},
    ):
        assert client.put(f"{URL}/grant", headers=headers).status_code == 401
    grant = client.put(f"{URL}/grant", headers=USER).json()["grant_id"]
    for token in ("service", "read-worker", "bad", ""):
        response = client.post(
            f"{URL}/bearer", json={"grant_id": grant}, headers={"X-Service-Token": token}
        )
        assert response.status_code == 401
    other = client.post(
        "/internal/auto-market/leagues/other/bearer", json={"grant_id": grant}, headers=WORKER
    )
    assert other.status_code == 401
    extra = client.post(f"{URL}/bearer", json={"grant_id": grant, "user_id": "bob"}, headers=WORKER)
    assert extra.status_code == 422


def test_scouting_grant_cannot_redeem_write_bearer(client, container):
    seed(container)
    read_grant = client.put("/internal/scouting/leagues/l1/grant", headers=USER).json()["grant_id"]
    response = client.post(f"{URL}/bearer", json={"grant_id": read_grant}, headers=WORKER)
    assert response.status_code == 401


def test_unconfigured_write_token_rejects_every_redemption(client, container):
    seed(container)
    container.settings.auto_market_service_token = ""
    grant = client.put(f"{URL}/grant", headers=USER).json()["grant_id"]
    response = client.post(
        f"{URL}/bearer", json={"grant_id": grant}, headers={"X-Service-Token": ""}
    )
    assert response.status_code == 401


# ---- Edge cases ---- #
async def test_grants_connection_removed_changed_revoked_or_expired_never_resolve(monkeypatch):
    connections = MemoryConnectionRepo()
    grants = AutoMarketGrants(connections)
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
    await connections.save(connection())
    grant = await grants.create("alice", "l1")
    now = auto_market.time.time()
    monkeypatch.setattr(auto_market.time, "time", lambda: now + 31 * 24 * 3600)
    with pytest.raises(NeedsReauth):
        await grants.resolve(grant, "l1")


def test_pairing_unlink_revokes_write_grants(client, container):
    seed(container)
    grant = asyncio.run(container.auto_market_grants.create("alice", "l1"))
    response = client.delete("/laliga/connection", headers={"Authorization": "Bearer alice"})
    assert response.status_code == 200
    assert client.post(f"{URL}/bearer", json={"grant_id": grant}, headers=WORKER).status_code == 401
