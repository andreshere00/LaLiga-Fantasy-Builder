# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import os
from contextlib import asynccontextmanager
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
from fantasy_api.domain.errors import NotFoundError, UnauthorizedError, UpstreamError
from fantasy_api.main import create_app
from fantasy_api.repositories.auto_market import AutoMarketRepository
from fantasy_api.repositories.auto_market_sources import AutoMarketSources
from fantasy_api.repositories.scouting_sources import ScoutingSources
from fantasy_api.schemas.auto_market import (
    AutoExecutionsResponse,
    AutoRule,
    AutoRulesResponse,
    AutoRuleWrite,
)
from fantasy_api.services.auto_market import AutoMarketService
from fantasy_api.services.auto_market_rules import percent_to_bps, threshold_amount
from pydantic import ValidationError

LATER = (datetime.now(UTC) + timedelta(days=3)).isoformat()


def sell(**changes):
    body = {
        "side": "sell",
        "playerId": "7",
        "playerTeamId": "s7",
        "triggerKind": "relative",
        "triggerPercent": 5,
    }
    return body | changes


def buy(**changes):
    body = {
        "side": "buy",
        "playerId": "8",
        "triggerKind": "absolute",
        "triggerAmount": 90_000_000,
        "maxSpend": 95_000_000,
    }
    return body | changes


class FakeSession:
    """In-memory stand-in for the Postgres session with the same contract."""

    def __init__(self, store, owner):
        self.store, self.owner = store, owner

    async def rules(self, league):
        rows = [r for r in self.store.rules if (r["owner"], r["league"]) == (self.owner, league)]
        return AutoRulesResponse(
            rules=[self.store.model(r) for r in reversed(rows)],
            status="active" if self.store.grants.get((self.owner, league)) else "inactive",
        )

    async def executions(self, league, limit):
        return AutoExecutionsResponse(executions=[])

    async def arm(self, league, name, grant, write, player_name, baseline):
        for r in self.store.rules:
            same = (r["owner"], r["league"], write.player_id, write.side) == (
                self.owner,
                league,
                r["player_id"],
                r["side"],
            )
            if same and r["state"] in ("armed", "listed", "executing"):
                raise UpstreamError("exists", status_code=409, category="rule_exists")
        self.store.grants[(self.owner, league)] = grant
        rule = {
            "id": len(self.store.rules) + 1,
            "owner": self.owner,
            "league": league,
            "state": "armed",
            "write": write,
            "player_id": write.player_id,
            "side": write.side,
            "name": player_name,
            "baseline": baseline,
        }
        self.store.rules.append(rule)
        return rule["id"]

    async def replace(self, league, rule_id, write, player_name, baseline):
        for r in self.store.rules:
            if r["id"] == rule_id and r["owner"] == self.owner and r["state"] == "armed":
                r.update(write=write, name=player_name, baseline=baseline)
                return
        raise NotFoundError("armed rule not found")

    async def resume(self, league, grant):
        self.store.grants[(self.owner, league)] = grant

    async def cancel(self, league, rule_id):
        for r in self.store.rules:
            if (
                r["id"] == rule_id
                and r["owner"] == self.owner
                and r["state"] in ("armed", "listed")
            ):
                r["state"] = "cancelled"
                live = [
                    x
                    for x in self.store.rules
                    if x["owner"] == self.owner and x["state"] in ("armed", "listed")
                ]
                return not live
        raise NotFoundError("live rule not found")

    async def leagues(self):
        return [lid for (owner, lid) in self.store.grants if owner == self.owner]

    async def delete_account(self):
        self.store.rules = [r for r in self.store.rules if r["owner"] != self.owner]


class FakeRepository:
    def __init__(self):
        self.rules, self.grants = [], {}

    async def aclose(self):
        pass

    @asynccontextmanager
    async def session(self, owner):
        yield FakeSession(self, owner)

    def model(self, r):
        w = r["write"]
        bps = percent_to_bps(w.trigger_percent) if w.trigger_percent else None
        return AutoRule(
            id=r["id"],
            league_id=r["league"],
            side=w.side,
            target=w.target,
            player_id=w.player_id,
            player_team_id=w.player_team_id,
            player_name=r["name"],
            trigger_kind=w.trigger_kind,
            trigger_percent=w.trigger_percent,
            trigger_amount=w.trigger_amount,
            baseline_value=r["baseline"],
            threshold_amount=threshold_amount(
                w.side, w.trigger_kind, r["baseline"], bps=bps, amount=w.trigger_amount
            ),
            price_mode=w.price_mode,
            bid_amount=w.bid_amount,
            max_spend=w.max_spend,
            list_now=w.lists_now,
            state=r["state"],
            armed_at=datetime.now(UTC),
            expires_at=w.expires_at,
        )


@pytest_asyncio.fixture
async def application():
    state = {
        "leagues": [{"id": "l1", "name": "Liga", "team": {"id": "t1", "manager": {"id": "1"}}}],
        "cards": {
            "7": {
                "playerTeamId": "s7",
                "managerId": "1",
                "playerMaster": {"id": "7", "nickname": "Pedri", "marketValue": 100_000_000},
            },
            "8": {
                "playerTeamId": "s8",
                "managerId": "2",
                "playerMaster": {"id": "8", "name": "Gavi", "marketValue": 100_000_000},
            },
        },
        "auth": [],
        "bearer_status": 200,
        "card_override": None,
        "history": [],
    }

    def fantasy(request):
        if request.url.path.endswith("/market-value"):
            assert "authorization" not in request.headers
            return httpx.Response(200, json=state["history"])
        assert request.headers["authorization"] == "Bearer transient-laliga-secret"
        if request.url.path.endswith("/leagues"):
            return httpx.Response(200, json=state["leagues"])
        player = request.url.path.split("/player/")[1].split("/")[0]
        if state["card_override"] is not None:
            return httpx.Response(200, json=state["card_override"])
        return httpx.Response(200, json=state["cards"][player])

    def auth(request):
        state["auth"].append((request.method, request.url.path))
        if request.url.path == "/internal/laliga/bearer":
            if state["bearer_status"] != 200:
                return httpx.Response(state["bearer_status"], json={})
            return httpx.Response(
                200,
                json={
                    "bearer_token": "transient-laliga-secret",
                    "expires_at": 1999999999,
                    "token_type": "Bearer",
                },
            )
        assert request.headers["X-Service-Token"] == "api-secret"
        assert "/internal/auto-market/" in request.url.path
        if request.method == "DELETE" and state.get("revoke_status", 200) != 200:
            return httpx.Response(state["revoke_status"], json={})
        return httpx.Response(
            200, json={"grant_id": "g" * 43} if request.method == "PUT" else {"ok": True}
        )

    credentials = AuthCredentialsClient(
        base_url="http://auth", service_token="api-secret", transport=httpx.MockTransport(auth)
    )
    grants = ScoutingAuthClient(
        "http://auth",
        "api-secret",
        "write-secret",
        httpx.MockTransport(auth),
        scope="auto-market",
    )
    client_fantasy = LaligaFantasyClient(
        origin="http://fantasy", transport=httpx.MockTransport(fantasy)
    )
    repository = FakeRepository()
    service = AutoMarketService(
        repository,
        AutoMarketSources(ScoutingSources(client_fantasy, 1), client_fantasy, 1),
        credentials,
        grants,
    )

    class Validator:
        def validate(self, token):
            if token not in ("alice", "bob"):
                raise UnauthorizedError()
            return {"sub": token}

    container = build_container(
        Settings(_env_file=None, scouting_database_url=""),
        jwt_validator=Validator(),
        credentials=credentials,
        laliga_client=client_fantasy,
    )
    container.auto_market_service = service
    app = create_app(container=container)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://api",
        headers={"Authorization": "Bearer alice"},
    ) as client:
        yield client, state, repository
    await container.aclose()


# ---- Happy path ---- #


def test_threshold_amount_relative_sell_rounds_up_and_buy_rounds_down():
    assert threshold_amount("sell", "relative", 1_000_001, bps=500) == 1_050_002
    assert threshold_amount("buy", "relative", 1_000_001, bps=500) == 950_000
    assert threshold_amount("buy", "relative", 100, bps=9_900) == 1


def test_threshold_amount_absolute_ignores_baseline_and_percent_uses_whole_basis_points():
    assert threshold_amount("sell", "absolute", 1, amount=150_000_000) == 150_000_000
    assert percent_to_bps(0.1) == 10
    assert percent_to_bps(12.34) == 1234


def test_auto_rule_write_valid_sell_and_buy_rules_are_accepted():
    sell_rule = AutoRuleWrite.model_validate(sell(priceMode="market_value", expiresAt=LATER))
    assert sell_rule.trigger_percent == 5 and sell_rule.price_mode == "market_value"
    clause = AutoRuleWrite.model_validate(buy(target="clause", playerTeamId="s8"))
    assert clause.target == "clause"
    assert AutoRuleWrite.model_validate(buy(bidAmount=94_000_000)).bid_amount == 94_000_000


def test_auto_rule_write_list_only_and_list_now_sells_list_the_player_at_once():
    only = AutoRuleWrite.model_validate(
        sell(triggerKind="none", triggerPercent=None, priceMode="market_value")
    )
    assert only.lists_now and only.trigger_percent is None
    waiting = AutoRuleWrite.model_validate(sell(listNow=True))
    assert waiting.lists_now and waiting.trigger_percent == 5
    assert not AutoRuleWrite.model_validate(sell()).lists_now
    assert threshold_amount("sell", "none", 100_000_000) == 100_000_000


async def test_arm_sell_rule_returns_201_and_lists_threshold_without_secrets(application):
    client, state, _ = application
    response = await client.post("/auto-market/leagues/l1/rules", json=sell())
    assert response.status_code == 201
    data = (await client.get("/auto-market/leagues/l1/rules")).json()
    rule = data["rules"][0]
    assert (rule["baselineValue"], rule["thresholdAmount"]) == (100_000_000, 105_000_000)
    assert (rule["playerName"], rule["state"], data["status"]) == ("Pedri", "armed", "active")
    assert "transient-laliga-secret" not in response.text + str(data)
    assert ("PUT", "/internal/auto-market/leagues/l1/grant") in state["auth"]


async def test_arm_list_only_sell_rule_is_stored_as_listing_now_without_a_trigger(application):
    client, _, _ = application
    body = sell(triggerKind="none", triggerPercent=None, priceMode="market_value")
    assert (await client.post("/auto-market/leagues/l1/rules", json=body)).status_code == 201
    rule = (await client.get("/auto-market/leagues/l1/rules")).json()["rules"][0]
    assert (rule["triggerKind"], rule["listNow"], rule["thresholdAmount"]) == (
        "none",
        True,
        100_000_000,
    )


async def test_arm_buy_rule_with_clause_target_is_accepted_for_a_rival_player(application):
    client, _, _ = application
    body = buy(target="clause", playerTeamId="s8", expiresAt=LATER)
    assert (await client.post("/auto-market/leagues/l1/rules", json=body)).status_code == 201


async def test_replace_armed_rule_rebaselines_from_current_value(application):
    client, state, _ = application
    await client.post("/auto-market/leagues/l1/rules", json=sell())
    state["cards"]["7"]["playerMaster"]["marketValue"] = 120_000_000
    response = await client.put("/auto-market/leagues/l1/rules/1", json=sell(triggerPercent=10))
    assert response.status_code == 200
    rule = (await client.get("/auto-market/leagues/l1/rules")).json()["rules"][0]
    assert (rule["baselineValue"], rule["thresholdAmount"]) == (120_000_000, 132_000_000)


async def test_cancel_last_rule_revokes_write_delegation_and_keeps_others(application):
    client, state, _ = application
    await client.post("/auto-market/leagues/l1/rules", json=sell())
    await client.post("/auto-market/leagues/l1/rules", json=buy())
    await client.delete("/auto-market/leagues/l1/rules/1")
    assert ("DELETE", "/internal/auto-market/leagues/l1/grant") not in state["auth"]
    await client.delete("/auto-market/leagues/l1/rules/2")
    assert ("DELETE", "/internal/auto-market/leagues/l1/grant") in state["auth"]


async def test_cancel_succeeds_even_when_revoking_the_unused_grant_fails(application):
    client, state, _ = application
    await client.post("/auto-market/leagues/l1/rules", json=sell())
    state["revoke_status"] = 500
    assert (await client.delete("/auto-market/leagues/l1/rules/1")).status_code == 200
    rules = (await client.get("/auto-market/leagues/l1/rules")).json()["rules"]
    assert rules[0]["state"] == "cancelled"


async def test_replace_renews_the_write_delegation(application):
    client, state, _ = application
    await client.post("/auto-market/leagues/l1/rules", json=sell())
    state["auth"].clear()
    assert (await client.put("/auto-market/leagues/l1/rules/1", json=sell())).status_code == 200
    assert ("PUT", "/internal/auto-market/leagues/l1/grant") in state["auth"]


async def test_rules_are_scoped_to_the_verified_subject_and_account_delete_revokes(application):
    client, state, _ = application
    await client.post("/auto-market/leagues/l1/rules", json=sell())
    bob = {"Authorization": "Bearer bob"}
    assert (await client.get("/auto-market/leagues/l1/rules", headers=bob)).json()["rules"] == []
    assert (await client.delete("/auto-market/leagues/l1/rules/1", headers=bob)).status_code == 404
    assert (await client.delete("/auto-market/account")).status_code == 200
    assert ("DELETE", "/internal/auto-market/leagues/l1/grant") in state["auth"]
    assert (await client.get("/auto-market/leagues/l1/rules")).json()["rules"] == []
    assert (await client.get("/auto-market/leagues/l1/executions")).json() == {"executions": []}


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "body",
    [
        sell(triggerAmount=1),
        sell(triggerPercent=600),
        sell(triggerPercent=0.05),
        sell(triggerPercent=1.234),
        sell(playerTeamId=None),
        sell(maxSpend=10),
        sell(target="clause"),
        sell(userId="bob"),
        sell(triggerKind="none"),
        sell(triggerKind="none", triggerPercent=None),
        sell(triggerKind="none", triggerPercent=None, triggerAmount=5, priceMode="market_value"),
        buy(triggerKind="none", triggerAmount=None, priceMode="market_value"),
        buy(listNow=True),
        sell(expiresAt="2030-01-01T00:00:00"),
        buy(triggerPercent=5),
        buy(triggerKind="relative", triggerAmount=None, triggerPercent=99.5),
        buy(maxSpend=None),
        buy(target="clause"),
        buy(target="clause", playerTeamId="s8", priceMode="market_value"),
        buy(bidAmount=99_000_000),
        buy(triggerAmount=0),
        buy(triggerAmount=1_000_000_000),
        {"side": "hold"},
    ],
)
def test_auto_rule_write_incoherent_rules_are_rejected(body):
    with pytest.raises(ValidationError):
        AutoRuleWrite.model_validate(body)


async def test_arm_invalid_body_is_422_and_missing_or_bad_jwt_is_401(application):
    client, _, _ = application
    assert (
        await client.post("/auto-market/leagues/l1/rules", json=sell(maxSpend=1))
    ).status_code == 422
    for headers in ({"Authorization": ""}, {"Authorization": "Bearer nobody"}):
        assert (
            await client.get("/auto-market/leagues/l1/rules", headers=headers)
        ).status_code == 401
        response = await client.post("/auto-market/leagues/l1/rules", json=sell(), headers=headers)
        assert response.status_code == 401


async def test_arm_when_laliga_needs_reauth_returns_401_and_stores_nothing(application):
    client, state, repository = application
    state["bearer_status"] = 401
    response = await client.post("/auto-market/leagues/l1/rules", json=sell())
    assert response.status_code == 401 and repository.rules == []


async def test_arm_unknown_league_or_wrong_ownership_is_404(application):
    client, _, repository = application
    assert (await client.post("/auto-market/leagues/zz/rules", json=sell())).status_code == 404
    assert (
        await client.post(
            "/auto-market/leagues/l1/rules", json=sell(playerId="8", playerTeamId="s8")
        )
    ).status_code == 404
    assert (
        await client.post("/auto-market/leagues/l1/rules", json=buy(playerId="7"))
    ).status_code == 404
    mismatch = sell(playerTeamId="other")
    assert (await client.post("/auto-market/leagues/l1/rules", json=mismatch)).status_code == 404
    assert repository.rules == []


async def test_arm_expired_deadline_duplicate_rule_and_missing_value(application):
    client, state, _ = application
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    assert (
        await client.post("/auto-market/leagues/l1/rules", json=sell(expiresAt=past))
    ).status_code == 422
    assert (await client.post("/auto-market/leagues/l1/rules", json=sell())).status_code == 201
    duplicate = await client.post("/auto-market/leagues/l1/rules", json=sell())
    assert duplicate.status_code == 409 and duplicate.json()["error"] == "rule_exists"
    state["cards"]["8"]["playerMaster"]["marketValue"] = 0
    assert (await client.post("/auto-market/leagues/l1/rules", json=buy())).status_code == 404


async def test_arm_unexpected_upstream_shapes_are_502_without_leaking_bodies(application):
    client, state, repository = application
    for card in ([], {"playerMaster": {"id": "other"}}, {"playerMaster": None}):
        state["card_override"] = card
        response = await client.post("/auto-market/leagues/l1/rules", json=sell())
        assert response.status_code == 502
        assert "transient-laliga-secret" not in response.text
    assert repository.rules == []


async def test_replace_or_cancel_unknown_or_finished_rule_is_404(application):
    client, _, repository = application
    assert (await client.put("/auto-market/leagues/l1/rules/9", json=sell())).status_code == 404
    await client.post("/auto-market/leagues/l1/rules", json=sell())
    repository.rules[0]["state"] = "executed"
    assert (await client.put("/auto-market/leagues/l1/rules/1", json=sell())).status_code == 404
    assert (await client.delete("/auto-market/leagues/l1/rules/1")).status_code == 404


async def test_routes_without_configured_storage_return_503():
    class Validator:
        def validate(self, token):
            return {"sub": token}

    container = build_container(
        Settings(_env_file=None, scouting_database_url=""), jwt_validator=Validator()
    )
    container.auto_market_service = None
    app = create_app(container=container)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://api",
        headers={"Authorization": "Bearer alice"},
    ) as client:
        response = await client.get("/auto-market/leagues/l1/rules")
    assert response.status_code == 503
    await container.aclose()


# ---- Edge cases ---- #


async def test_arm_falls_back_to_newest_public_history_entry_without_card_value(application):
    client, state, _ = application
    state["cards"]["7"]["playerMaster"].pop("marketValue")
    state["history"] = [
        {"date": "2026-11-01", "marketValue": 90_000_000},
        {"date": "2026-11-20", "marketValue": 110_000_000},
        {"date": "2026-11-21", "marketValue": None},
    ]
    assert (await client.post("/auto-market/leagues/l1/rules", json=sell())).status_code == 201
    rule = (await client.get("/auto-market/leagues/l1/rules")).json()["rules"][0]
    assert rule["baselineValue"] == 110_000_000


# ---- PostgreSQL integration ---- #


@pytest_asyncio.fixture
async def repository():
    url = os.getenv("SCOUTING_TEST_DATABASE_URL")
    if not url:
        pytest.skip("SCOUTING_TEST_DATABASE_URL required for PostgreSQL integration")
    admin = await asyncpg.connect(url)
    schema = "auto_market_test_" + uuid4().hex
    await admin.execute(f'CREATE SCHEMA "{schema}"')
    sep = "&" if "?" in url else "?"
    repo = AutoMarketRepository(f"{url}{sep}search_path={schema}")
    await repo.start()
    try:
        yield repo
    finally:
        await repo.aclose()
        await admin.execute(f'DROP SCHEMA "{schema}" CASCADE')
        await admin.close()


async def test_postgres_rules_enforce_one_live_rule_cancel_idle_and_owner_scope(repository):
    write = AutoRuleWrite.model_validate(sell())
    async with repository.session("alice") as session:
        rule_id = await session.arm("l1", "Liga", "grant", write, "Pedri", 100_000_000)
        other = AutoRuleWrite.model_validate(sell(playerId="8", playerTeamId="s8"))
        other_id = await session.arm("l1", "Liga", "grant", other, "Gavi", 90_000_000)
    # A unique violation aborts its transaction, so each clash runs in its own session.
    with pytest.raises(UpstreamError) as exc:
        async with repository.session("alice") as session:
            await session.arm("l1", "Liga", "grant", write, "Pedri", 100_000_000)
    assert exc.value.status_code == 409
    with pytest.raises(UpstreamError) as clash:
        async with repository.session("alice") as session:
            await session.replace("l1", other_id, write, "Pedri", 100_000_000)
    assert clash.value.status_code == 409 and clash.value.category == "rule_exists"
    async with repository.session("alice") as session:
        await session.cancel("l1", other_id)
    async with repository.session("alice") as session:
        data = await session.rules("l1")
        assert data.rules[0].threshold_amount == 105_000_000 and data.status == "active"
        assert (await repository.due()) == [("alice", "l1")]
    async with repository.session("bob") as session:
        assert (await session.rules("l1")).rules == []
        with pytest.raises(NotFoundError):
            await session.cancel("l1", rule_id)
    async with repository.session("alice") as session:
        assert await session.cancel("l1", rule_id) is True
        assert (await session.rules("l1")).status == "inactive"
        with pytest.raises(NotFoundError):
            await session.replace("l1", rule_id, write, "Pedri", 1)
        await session.arm("l1", "Liga", "grant", write, "Pedri", 100_000_000)
        await session.delete_account()
        assert (await session.rules("l1")).rules == []


async def test_postgres_claim_is_version_guarded_and_finish_records_once(repository):
    write = AutoRuleWrite.model_validate(sell())
    async with repository.session("alice") as session:
        rule_id = await session.arm("l1", "Liga", "grant", write, "Pedri", 100_000_000)
        (live,) = await session.live_rules("l1")
        assert (live.version, live.rule.state) == (1, "armed")
        assert await session.claim(rule_id, "armed", 99) is False
        assert await session.claim(rule_id, "armed", 1) is True
        assert await session.claim(rule_id, "armed", 1) is False
        await session.finish(
            rule_id, 2, "listed", "list", "ok", amount=106, listed_price=106, accept_floor=105
        )
        await session.note(rule_id, 2, "list", "ok", amount=106)
        await session.note(rule_id, 3, "skip", "skipped", reason="squad_full")
        await session.note(rule_id, 3, "skip", "skipped", reason="squad_full")
        stored = (await session.rules("l1")).rules[0]
        assert (stored.state, stored.listed_price, stored.accept_floor) == ("listed", 106, 105)
        assert stored.listed_at is not None
        history = (await session.executions("l1", 10)).executions
        assert [(x.action, x.outcome) for x in history] == [("skip", "skipped"), ("list", "ok")]
        assert await session.claim(rule_id, "listed", 3) is True
        await session.release(rule_id, "listed", 4)
        (again,) = await session.live_rules("l1")
        assert (again.rule.state, again.claimed_at) == ("listed", None)
        await session.health("l1", "needs_reauth", datetime.now(UTC), False)
        assert (await session.league("l1"))["failures"] == 1
        assert await repository.due() == []
