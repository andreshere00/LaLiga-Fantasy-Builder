# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import asyncpg
import httpx
import pytest
import pytest_asyncio
from fantasy_api.api.deps import build_container
from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.clients.scouting_auth import ScoutingAuthClient
from fantasy_api.config import Settings
from fantasy_api.domain.errors import UnauthorizedError, UpstreamError
from fantasy_api.main import create_app
from fantasy_api.repositories.scouting import ScoutingRepository
from fantasy_api.repositories.scouting_sources import ScoutingSources
from fantasy_api.schemas.scouting import Observation, WatchWrite
from fantasy_api.services.scouting import ScoutingService
from fantasy_api.services.scouting_events import detect_events

NOW = datetime(2026, 11, 5, 12, tzinfo=UTC)
PREFS = WatchWrite(market_alert=True, clause_alert=True)


def observation(**changes) -> Observation:
    data = dict(
        name="Pedri",
        owner_id="rival",
        player_team_id="slot",
        rival=True,
        unlock_at=NOW + timedelta(hours=6),
        shielded=False,
        clause=1000,
        clause_enabled=True,
        checked_at=NOW,
    )
    return Observation(**(data | changes))


@pytest_asyncio.fixture
async def repository():
    url = os.getenv("SCOUTING_TEST_DATABASE_URL")
    if not url:
        pytest.skip("SCOUTING_TEST_DATABASE_URL required for PostgreSQL integration")
    admin = await asyncpg.connect(url)
    schema = "scouting_test_" + uuid4().hex
    await admin.execute(f'CREATE SCHEMA "{schema}"')
    sep = "&" if "?" in url else "?"
    repo = ScoutingRepository(f"{url}{sep}search_path={schema}")
    await repo.start()
    try:
        yield repo
    finally:
        await repo.aclose()
        await admin.execute(f'DROP SCHEMA "{schema}" CASCADE')
        await admin.close()


@pytest_asyncio.fixture
async def application(repository):
    state = {
        "leagues": [
            {
                "id": "l1",
                "name": "Liga",
                "team": {"id": "t1", "manager": {"id": "1"}},
                "config": {"features": {"buyoutClause": True}},
            }
        ],
        "market": [],
        "card": {
            "playerTeamId": "s7",
            "managerId": "2",
            "manager": {"id": "2", "managerName": "Rival"},
            "playerMaster": {"id": "7", "nickname": "Pedri"},
            "buyoutClause": 1000,
            "isShielded": False,
            "buyoutClauseLockedEndTime": (datetime.now(UTC) + timedelta(hours=6)).isoformat(),
        },
        "shield": {"isShielded": False},
    }

    def fantasy(request):
        assert request.headers["authorization"] == "Bearer transient-laliga-secret"
        if request.url.path.endswith("/leagues"):
            return httpx.Response(200, json=state["leagues"])
        if request.url.path.endswith("/market"):
            return httpx.Response(200, json=state["market"])
        if request.url.path.endswith("/check-shield"):
            return httpx.Response(200, json=state["shield"])
        return httpx.Response(200, json=state["card"])

    def auth(request):
        if request.url.path.endswith("/grant"):
            assert request.headers["X-Service-Token"] == "api-secret"
            return httpx.Response(
                200, json={"grant_id": "g" * 43} if request.method == "PUT" else {"ok": True}
            )
        if "/scouting/" in request.url.path:
            assert request.headers["X-Service-Token"] == "worker-secret"
            assert "Authorization" not in request.headers
        return httpx.Response(
            200,
            json={
                "bearer_token": "transient-laliga-secret",
                "expires_at": 1999999999,
                "token_type": "Bearer",
            },
        )

    credentials = AuthCredentialsClient(
        base_url="http://auth", service_token="api-secret", transport=httpx.MockTransport(auth)
    )
    grants = ScoutingAuthClient(
        "http://auth", "api-secret", "worker-secret", httpx.MockTransport(auth)
    )
    fantasy_client = LaligaFantasyClient(
        origin="http://fantasy", transport=httpx.MockTransport(fantasy)
    )
    service = ScoutingService(repository, ScoutingSources(fantasy_client, 1), credentials, grants)

    class Validator:
        def validate(self, token):
            if token not in ("alice", "bob"):
                raise UnauthorizedError()
            return {"sub": token}

    container = build_container(
        Settings(), jwt_validator=Validator(), credentials=credentials, laliga_client=fantasy_client
    )
    await container.scouting_service.aclose()
    container.scouting_service = service
    app = create_app(container=container)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://api",
        headers={"Authorization": "Bearer alice"},
    ) as client:
        yield client, service, state
    await container.aclose()


async def due(repo, owner="alice"):
    async with repo.session(owner) as session:
        await session.conn.execute(
            "UPDATE scouting_leagues SET next_check=now()-interval '1 minute' WHERE owner_id=$1",
            owner,
        )


# ---- Happy path ---- #


@pytest.mark.parametrize("hours", [1, 6, 24])
def test_detect_events_configured_lead_schedules_warning_and_unlock(hours):
    current = observation(unlock_at=NOW + timedelta(hours=hours, minutes=2))
    first, events, next_check = detect_events(
        None, current, PREFS.model_copy(update={"lead_hours": hours}), NOW
    )
    assert events == []
    assert next_check == NOW + timedelta(minutes=2)
    _, events, next_check = detect_events(
        first, current, PREFS.model_copy(update={"lead_hours": hours}), NOW + timedelta(minutes=3)
    )
    assert events == [("clause_soon", first.cycle)]


def test_detect_events_first_check_and_market_relisting_avoid_historical_events():
    first, events, _ = detect_events(
        None,
        observation(listings=["m1"], available=True, unlock_at=NOW - timedelta(days=1)),
        PREFS,
        NOW,
    )
    assert events == []
    same, events, _ = detect_events(first, first.model_copy(), PREFS, NOW)
    assert events == []
    gone, _, _ = detect_events(same, first.model_copy(update={"listings": []}), PREFS, NOW)
    again, events, _ = detect_events(gone, first.model_copy(), PREFS, NOW)
    assert events == [("market", again.episode)]
    assert again.episode != first.episode


async def test_favorites_watch_inbox_and_remove_preserve_history(application):
    client, service, state = application
    assert (await client.put("/scouting/favorites/7")).status_code == 200
    assert (
        await client.post("/scouting/favorites/import", json={"player_ids": ["7", "8"]})
    ).status_code == 200
    await client.put("/scouting/leagues/l1/watches/7", json=PREFS.model_dump())
    await service.evaluate("alice", "l1")
    data = (await client.get("/scouting/favorites?league_id=l1")).json()
    assert len(data["favorites"]) == 2
    assert data["status"] == "active"
    inbox = (await client.get("/scouting/notifications")).json()
    assert inbox["unreadCount"] == 1
    assert inbox["notifications"][0]["kind"] == "clause_soon"
    nid = inbox["notifications"][0]["id"]
    assert (await client.put(f"/scouting/notifications/{nid}/read")).status_code == 200
    await client.put(f"/scouting/notifications/{nid}/read")
    assert (await client.get("/scouting/notifications")).json()["unreadCount"] == 0
    await client.delete("/scouting/favorites/7")
    assert len((await client.get("/scouting/notifications")).json()["notifications"]) == 1
    assert await service.repository.due() == []
    assert (await client.delete("/scouting/account")).status_code == 200
    assert (await client.get("/scouting/notifications")).json()["notifications"] == []


async def test_evaluate_concurrent_passes_and_restarts_emit_once(application):
    client, service, state = application
    await client.put("/scouting/favorites/7")
    await client.put("/scouting/leagues/l1/watches/7", json=PREFS.model_dump())
    await service.evaluate("alice", "l1")
    state["market"] = [{"id": "sale", "discr": "marketPlayerTeam", "playerMaster": {"id": "7"}}]
    state["card"]["buyoutClauseLockedEndTime"] = (
        datetime.now(UTC) - timedelta(hours=1)
    ).isoformat()
    await due(service.repository)
    await asyncio.gather(service.evaluate("alice", "l1"), service.evaluate("alice", "l1"))
    assert len((await service.inbox("alice", None, None, 50)).notifications) == 3
    await due(service.repository)
    await service.evaluate("alice", "l1")
    inbox = await service.inbox("alice", None, None, 1)
    assert inbox.next_cursor is not None and inbox.unread_count == 3
    page = await service.inbox("alice", "l1", int(inbox.next_cursor), 50)
    assert len(page.notifications) == 2
    assert await service.repository.due() == []


async def test_refresh_revalidates_and_enforces_poll_budget(application):
    client, service, state = application
    await service.add("alice", ["7"])
    await service.refresh("alice", "alice", "l1")
    await service.watch("alice", "alice", "l1", "7", PREFS)
    await service.refresh("alice", "alice", "l1")
    first = await service.favorites("alice", "l1")
    await service.refresh("alice", "alice", "l1")
    assert (await service.favorites("alice", "l1")).checked_at == first.checked_at
    await service.watch(
        "alice", "alice", "l1", "7", WatchWrite(market_alert=False, clause_alert=False)
    )
    assert (await service.favorites("alice", "l1")).status == "inactive"


# ---- Error paths ---- #


async def test_routes_foreign_subject_and_invalid_writes_are_isolated(application):
    client, service, state = application
    assert (
        await client.get("/scouting/favorites", headers={"Authorization": ""})
    ).status_code == 401
    assert (
        await client.get("/scouting/favorites", headers={"Authorization": "Bearer bad"})
    ).status_code == 401
    await service.add("bob", ["7"])
    assert (await client.get("/scouting/favorites")).json()["favorites"] == []
    assert (
        await client.put("/scouting/leagues/l1/watches/7", json=PREFS.model_dump())
    ).status_code == 404
    await service.add("alice", ["7"])
    for body in (
        {},
        PREFS.model_dump() | {"user_id": "bob"},
        PREFS.model_dump() | {"lead_hours": 2},
        PREFS.model_dump() | {"market_alert": "true"},
    ):
        assert (await client.put("/scouting/leagues/l1/watches/7", json=body)).status_code == 422
    assert (await client.put("/scouting/favorites/wrong")).status_code == 422
    assert (await client.put("/scouting/notifications/1/read")).status_code == 404
    assert (await client.get("/scouting/notifications?cursor=0")).status_code == 422
    assert (
        await client.post("/scouting/favorites/import", json={"player_ids": ["bad"]})
    ).status_code == 422
    state["leagues"] = []
    assert (
        await client.put("/scouting/leagues/l1/watches/7", json=PREFS.model_dump())
    ).status_code == 404


async def test_evaluate_failed_snapshots_keep_observations_and_pause_membership(application):
    client, service, state = application
    await service.add("alice", ["7"])
    await service.watch("alice", "alice", "l1", "7", PREFS)
    await service.evaluate("alice", "l1")
    previous = (await service.favorites("alice", "l1")).favorites[0].observation
    state["market"] = {"userBids": []}
    await due(service.repository)
    await service.evaluate("alice", "l1")
    data = await service.favorites("alice", "l1")
    assert data.status == "degraded" and data.favorites[0].observation == previous
    state["market"] = []
    state["card"] = {"unrelated": 123}
    await due(service.repository)
    await service.evaluate("alice", "l1")
    assert (await service.favorites("alice", "l1")).favorites[0].observation == previous
    state["leagues"] = []
    await due(service.repository)
    await service.evaluate("alice", "l1")
    assert (await service.favorites("alice", "l1")).status == "not_member"


# ---- Edge cases ---- #


@pytest.mark.parametrize(
    "changes",
    [
        {"shielded": None},
        {"shielded": True},
        {"rival": False},
        {"clause_enabled": False},
        {"clause": None},
        {"unlock_at": None},
    ],
)
def test_detect_events_unknown_or_ineligible_protection_never_warns(changes):
    _, events, _ = detect_events(observation(), observation(**changes), PREFS, NOW)
    assert events == []


async def test_repository_missing_configuration_fails_closed():
    with pytest.raises(UpstreamError):
        await ScoutingRepository("").start()


async def test_sources_shield_unknown_and_own_sales_do_not_alert(application):
    client, service, state = application
    source = service._sources
    league = await source.membership("transient-laliga-secret", "l1")
    state["card"].pop("isShielded")
    state["shield"] = {"isShielded": None}
    state["card"]["buyoutClauseLockedEndTime"] = "not a date"
    value = await source.observe("transient-laliga-secret", league, "7", {}, datetime.now(UTC))
    assert not value.available and value.shielded is None and value.unlock_at is None
    state["card"]["managerId"] = "1"
    value = await source.observe(
        "transient-laliga-secret", league, "7", {"7": ["mine"]}, datetime.now(UTC)
    )
    assert value.listings == [] and not value.rival


async def test_repository_migrations_restart_health_and_metrics_are_repeatable(repository):
    await repository.ready()
    assert (await repository.metrics())["paused"] == 0
    second = ScoutingRepository(repository._url)
    try:
        await second.start()
        await asyncio.gather(repository.start(), second.start())
        async with repository.session("alice") as session:
            await session.add(["7"])
        async with second.session("alice") as session:
            assert len((await session.favorites(None)).favorites) == 1
    finally:
        await second.aclose()


async def test_evaluate_revoked_delegation_pauses_preserves_preferences(application):
    from unittest.mock import AsyncMock

    from fantasy_api.domain.errors import NeedsReauthError

    client, service, state = application
    await service.add("alice", ["7"])
    await service.watch("alice", "alice", "l1", "7", PREFS)
    redeem = service._grants.redeem
    service._grants.redeem = AsyncMock(side_effect=NeedsReauthError())
    await service.evaluate("alice", "l1")
    data = await service.favorites("alice", "l1")
    assert data.status == "needs_reauth" and data.favorites[0].watch == PREFS
    service._grants.redeem = redeem
    await service.refresh("alice", "alice", "l1")
    assert (await service.favorites("alice", "l1")).status == "active"


@pytest.mark.parametrize("payload", [{}, {"grant_id": "short"}, "not an object"])
async def test_grant_client_invalid_success_shape_fails_without_payload_leak(payload):
    client = ScoutingAuthClient(
        "http://auth",
        "api",
        "worker",
        httpx.MockTransport(lambda req: httpx.Response(200, json=payload)),
    )
    try:
        with pytest.raises(UpstreamError):
            await client.create("user-jwt", "league")
        with pytest.raises(UpstreamError):
            await client.redeem("g" * 43, "league")
    finally:
        await client.aclose()


@pytest.mark.parametrize("code", [401, 429, 503])
async def test_grant_client_failure_does_not_expose_credentials(code):
    from fantasy_api.domain.errors import NeedsReauthError

    client = ScoutingAuthClient(
        "http://auth",
        "api",
        "worker",
        httpx.MockTransport(lambda req: httpx.Response(code, text="private-token-payload")),
    )
    try:
        with pytest.raises((UpstreamError, NeedsReauthError)) as error:
            await client.redeem("g" * 43, "league")
        assert "private-token" not in str(error.value)
    finally:
        await client.aclose()


async def test_worker_continues_after_one_pass_failure_and_closes_on_shutdown(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    from fantasy_api import scouting_worker

    repo = SimpleNamespace(
        start=AsyncMock(),
        due=AsyncMock(return_value=[("a", "l1"), ("b", "l2")]),
        metrics=AsyncMock(return_value={"paused": 0}),
    )
    service = SimpleNamespace(
        repository=repo, evaluate=AsyncMock(side_effect=[RuntimeError("private"), None])
    )
    container = SimpleNamespace(
        scouting_service=service,
        settings=SimpleNamespace(scouting_service_token="worker"),
        aclose=AsyncMock(),
    )
    monkeypatch.setattr(scouting_worker, "build_container", lambda: container)
    monkeypatch.setattr(
        scouting_worker.asyncio, "sleep", AsyncMock(side_effect=asyncio.CancelledError)
    )
    with pytest.raises(asyncio.CancelledError):
        await scouting_worker.run_worker()
    assert service.evaluate.await_count == 2
    container.aclose.assert_awaited_once()


async def test_evaluate_fantasy_unauthorized_refreshes_once_then_keeps_old_observation(application):
    from unittest.mock import AsyncMock

    client, service, state = application
    await service.add("alice", ["7"])
    await service.watch("alice", "alice", "l1", "7", PREFS)
    real_membership = service._sources.membership
    membership = await real_membership("transient-laliga-secret", "l1")
    service._sources.membership = AsyncMock(
        side_effect=[UpstreamError("unauthorized", status_code=401), membership]
    )
    real_redeem = service._grants.redeem
    service._grants.redeem = AsyncMock(wraps=real_redeem)
    await service.evaluate("alice", "l1")
    assert service._grants.redeem.await_count == 2
    assert service._grants.redeem.await_args.kwargs == {"retry_unauthorized": True}
    assert (await service.favorites("alice", "l1")).status == "active"


async def test_sources_missing_clause_metadata_uses_cached_rival_roster(application):
    from unittest.mock import AsyncMock

    client, service, state = application
    source = service._sources
    league = await source.membership("transient-laliga-secret", "l1")
    slot = dict(state["card"])
    state["card"].pop("buyoutClauseLockedEndTime")
    source._leagues.list_teams = AsyncMock(
        return_value=[
            {
                "id": "t2",
                "manager": {"id": "2", "managerName": "Rival"},
                "players": [slot],
            }
        ]
    )
    cache = {}
    for _ in range(2):
        value = await source.observe(
            "transient-laliga-secret", league, "7", {}, datetime.now(UTC), cache
        )
        assert value.unlock_at is not None
    source._leagues.list_teams.assert_awaited_once()


async def test_watch_league_without_embedded_manager_uses_verified_team_membership(application):
    client, service, state = application
    state["leagues"][0]["team"] = {"id": 123, "money": 5000000}
    await service.add("alice", ["7"])
    response = await client.put("/scouting/leagues/l1/watches/7", json=PREFS.model_dump())
    assert response.status_code == 200
    assert (await service.favorites("alice", "l1")).favorites[0].watch == PREFS


async def test_sources_missing_league_manager_resolves_own_roster_once(application):
    from unittest.mock import AsyncMock

    client, service, state = application
    state["leagues"][0]["team"] = {"id": 123}
    source = service._sources
    source._leagues.get_team = AsyncMock(return_value={"id": 123, "managerId": 1, "players": []})
    league = await source.membership("transient-laliga-secret", "l1")
    cache = {}
    rival = await source.observe(
        "transient-laliga-secret", league, "7", {"7": ["rival-sale"]}, datetime.now(UTC), cache
    )
    assert rival.rival and rival.listings == ["rival-sale"]
    state["card"]["managerId"] = "1"
    own = await source.observe(
        "transient-laliga-secret", league, "7", {"7": ["own-sale"]}, datetime.now(UTC), cache
    )
    assert not own.rival and own.listings == [] and not own.available
    source._leagues.get_team.assert_awaited_once_with("transient-laliga-secret", "l1", "123")


async def test_sources_no_manager_ids_uses_complete_owned_player_identity(application):
    from unittest.mock import AsyncMock

    client, service, state = application
    state["leagues"][0]["team"] = {"id": "t1"}
    source = service._sources
    source._leagues.get_team = AsyncMock(
        return_value={"id": "t1", "players": [{"playerMaster": {"id": "7"}}]}
    )
    league = await source.membership("transient-laliga-secret", "l1")
    own = await source.observe(
        "transient-laliga-secret", league, "7", {"7": ["own-sale"]}, datetime.now(UTC)
    )
    assert not own.rival and own.listings == []
    source._leagues.get_team = AsyncMock(return_value={"id": "t1", "players": []})
    rival = await source.observe(
        "transient-laliga-secret", league, "7", {"7": ["rival-sale"]}, datetime.now(UTC)
    )
    assert rival.rival and rival.listings == ["rival-sale"]
    source._leagues.get_team = AsyncMock(return_value={"id": "t1"})
    with pytest.raises(UpstreamError):
        await source.observe("transient-laliga-secret", league, "7", {}, datetime.now(UTC))
