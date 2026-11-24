# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.clients.scouting_auth import ScoutingAuthClient
from fantasy_api.repositories.auto_market import LiveRule
from fantasy_api.repositories.auto_market_sources import AutoMarketSources
from fantasy_api.repositories.auto_market_writer import AutoMarketWriter
from fantasy_api.repositories.scouting_sources import ScoutingSources
from fantasy_api.schemas.auto_market import AutoRule
from fantasy_api.schemas.market import MarketOffer
from fantasy_api.services.auto_market_executor import AutoMarketExecutor
from fantasy_api.services.auto_market_rules import (
    MAX_LISTING_PRICE,
    accept_floor,
    best_offer,
    bid_amount,
    bid_limit,
    listing_price,
    threshold_reached,
)

NOW = datetime(2026, 11, 24, 12, tzinfo=UTC)
LEAGUE = "l1"


def rule(**changes) -> AutoRule:
    data = dict(
        id=1,
        league_id=LEAGUE,
        side="sell",
        target="market",
        player_id="7",
        player_team_id="s7",
        player_name="Pedri",
        trigger_kind="relative",
        trigger_percent=5,
        baseline_value=100_000_000,
        threshold_amount=105_000_000,
        price_mode="threshold",
        state="armed",
        armed_at=NOW - timedelta(days=1),
    )
    return AutoRule(**(data | changes))


def clause_rule(**changes) -> AutoRule:
    base = dict(
        side="buy",
        target="clause",
        player_id="8",
        player_team_id="s8",
        player_name="Gavi",
        trigger_kind="absolute",
        trigger_amount=90_000_000,
        threshold_amount=90_000_000,
        max_spend=95_000_000,
    )
    return rule(**(base | changes))


def market_rule(**changes) -> AutoRule:
    return clause_rule(**({"target": "market", "player_team_id": None} | changes))


class MemorySession:
    """Same contract as the Postgres session, including the version guard on claims."""

    def __init__(self, store):
        self.s = store

    async def league(self, league):
        return self.s.league

    async def live_rules(self, league):
        live = ("armed", "listed", "executing")
        return [
            LiveRule(r["rule"], r["version"], r["claimed_at"])
            for r in self.s.rules.values()
            if r["rule"].state in live
        ]

    async def deactivate_if_idle(self, league):
        if not await self.live_rules(league):
            self.s.league["status"], self.s.league["grant_id"] = "inactive", None
            return True
        return False

    async def claim(self, rule_id, state, version):
        r = self.s.rules[rule_id]
        if r["rule"].state != state or r["version"] != version:
            return False
        r.update(version=version + 1, claimed_at=NOW)
        r["rule"] = r["rule"].model_copy(update={"state": "executing"})
        return True

    async def release(self, rule_id, state, version):
        r = self.s.rules[rule_id]
        if r["rule"].state == "executing" and r["version"] == version:
            r.update(version=version + 1, claimed_at=None)
            r["rule"] = r["rule"].model_copy(update={"state": state})

    async def finish(
        self,
        rule_id,
        version,
        state,
        action,
        outcome,
        *,
        amount=None,
        reason=None,
        listed_price=None,
        accept_floor=None,
    ):
        r = self.s.rules[rule_id]
        if r["version"] != version:
            return
        update = {"state": state}
        if listed_price is not None:
            update |= {"listed_price": listed_price, "accept_floor": accept_floor, "listed_at": NOW}
        r.update(version=version + 1, claimed_at=None)
        r["rule"] = r["rule"].model_copy(update=update)
        await self.note(rule_id, version, action, outcome, amount=amount, reason=reason)

    async def note(self, rule_id, version, action, outcome, *, amount=None, reason=None):
        key = (rule_id, version, action, outcome, reason)
        if key not in self.s.keys:
            self.s.keys.add(key)
            self.s.log.append((rule_id, action, outcome, reason, amount))

    async def health(self, league, status, next_check, success):
        self.s.league.update(status=status, next_check=next_check)
        self.s.league["failures"] = 0 if success else self.s.league["failures"] + 1


class MemoryRepository:
    def __init__(self, *rules):
        self.rules = {r.id: {"rule": r, "version": 1, "claimed_at": None} for r in rules}
        self.keys, self.log = set(), []
        self.league = {
            "status": "active",
            "next_check": NOW - timedelta(minutes=1),
            "grant_id": "g" * 43,
            "failures": 0,
        }

    @asynccontextmanager
    async def session(self, owner):
        yield MemorySession(self)

    def state(self, rule_id=1):
        return self.rules[rule_id]["rule"].state


def world(**changes):
    state = {
        "leagues": [
            {
                "id": LEAGUE,
                "name": "Liga",
                "team": {"id": "t1", "manager": {"id": "1"}},
                "config": {"features": {"buyoutClause": True}},
            }
        ],
        "cards": {
            "7": {
                "playerTeamId": "s7",
                "managerId": "1",
                "playerMaster": {"id": "7", "nickname": "Pedri", "marketValue": 106_000_000},
            },
            "8": {
                "playerTeamId": "s8",
                "managerId": "2",
                "isShielded": False,
                "buyoutClause": 92_000_000,
                "buyoutClauseLockedEndTime": (NOW - timedelta(hours=1)).isoformat(),
                "playerMaster": {"id": "8", "name": "Gavi", "marketValue": 88_000_000},
            },
        },
        "market": [],
        "team": {"teamMoney": 200_000_000, "teamValue": 500_000_000, "playersNumber": 20},
        "offers": [],
        "shield": {"isShielded": False},
        "write_status": 200,
        "bearer_status": 200,
        "writes": [],
        "redeems": [],
        "reads": 0,
    }
    return state | changes


def build(repository, state):
    def fantasy(request):
        path, method = request.url.path, request.method
        assert request.headers["authorization"] == "Bearer transient-secret"
        if method != "GET":
            body = json.loads(request.content) if request.content else None
            state["writes"].append((method, path, body))
            return httpx.Response(state["write_status"], json={})
        state["reads"] += 1
        if path.endswith("/leagues"):
            return httpx.Response(200, json=state["leagues"])
        if "/player/" in path:
            return httpx.Response(200, json=state["cards"][path.split("/player/")[1].split("/")[0]])
        if path.endswith(f"/league/{LEAGUE}/market"):
            return httpx.Response(200, json=state["market"])
        if "/teams/" in path:
            return httpx.Response(200, json=state["team"])
        if path.endswith("/offer"):
            return httpx.Response(200, json=state["offers"])
        if path.endswith("/check-shield"):
            return httpx.Response(200, json=state["shield"])
        raise AssertionError(path)

    def auth(request):
        assert request.headers["X-Service-Token"] == "write-secret"
        assert "Authorization" not in request.headers
        state["redeems"].append(json.loads(request.content)["retry_unauthorized"])
        if state["bearer_status"] != 200:
            return httpx.Response(
                state["bearer_status"], json=state.get("bearer_body", {"error": "needs_reauth"})
            )
        return httpx.Response(
            200, json={"bearer_token": "transient-secret", "expires_at": 1999999999}
        )

    client = LaligaFantasyClient(origin="http://fantasy", transport=httpx.MockTransport(fantasy))
    grants = ScoutingAuthClient(
        "http://auth", "api-secret", "write-secret", httpx.MockTransport(auth), scope="auto-market"
    )
    sources = AutoMarketSources(ScoutingSources(client, 1), client, 1)
    return AutoMarketExecutor(
        repository, sources, AutoMarketWriter(client, 1), grants, clock=lambda: NOW
    )


async def run(*rules, **changes):
    repository = MemoryRepository(*rules)
    state = world(**changes)
    executor = build(repository, state)
    await executor.evaluate("alice", LEAGUE)
    return repository, state, executor


# ---- Happy path ---- #


def test_threshold_helpers_sell_waits_for_rise_buy_for_drop():
    assert threshold_reached("sell", 105, 105) and not threshold_reached("sell", 105, 104)
    assert threshold_reached("buy", 90, 90) and not threshold_reached("buy", 90, 91)


def test_listing_price_and_floor_follow_the_price_mode_and_never_list_below_value():
    assert listing_price(105, "threshold", 106) == 106
    assert listing_price(105, "market_value", 106) == 106
    assert listing_price(2_000_000_000, "threshold", 106) == MAX_LISTING_PRICE
    assert accept_floor(105, "threshold", 106) == 105
    assert accept_floor(105, "market_value", 106) == 106


def test_bid_amount_and_limit_never_bid_below_value_or_beyond_cash_plus_debt():
    assert bid_amount(90, "market_value", 95, 88) == 88
    assert bid_amount(90, "threshold", None, 88) == 90
    assert bid_amount(90, "threshold", 95, 88) == 95
    assert bid_amount(90, "threshold", 80, 88) == 88
    assert bid_limit(10, 100) == 30 and bid_limit(10, -5) == 10


def test_best_offer_takes_highest_pending_offer_at_or_above_floor_and_fails_closed():
    def offer(**kw):
        return MarketOffer(
            **({"id": "o", "money": 110, "status": "pending", "market_id": "m"} | kw)
        )

    assert best_offer([offer(money=120, id="a"), offer(money=110)], 100).id == "a"
    for bad in (
        offer(money=99),
        offer(status="accepted"),
        offer(status=None),
        offer(market_id=None),
        offer(id=None),
        offer(money=None),
    ):
        assert best_offer([bad], 100) is None


async def test_evaluate_sell_threshold_reached_lists_once_at_value_with_threshold_floor():
    repo, state, _ = await run(rule())
    assert [(m, p.endswith("/league/l1/market/sell"), b) for m, p, b in state["writes"]] == [
        ("POST", True, {"playerId": "s7", "salePrice": 106_000_000})
    ]
    stored = repo.rules[1]["rule"]
    assert (stored.state, stored.listed_price, stored.accept_floor) == (
        "listed",
        106_000_000,
        105_000_000,
    )
    assert repo.log == [(1, "list", "ok", None, 106_000_000)]
    assert repo.league["status"] == "active" and repo.league["next_check"] == NOW + timedelta(
        minutes=1
    )


async def test_evaluate_sell_market_value_mode_floors_at_the_value_when_it_fired():
    repo, _, _ = await run(rule(price_mode="market_value"))
    assert repo.rules[1]["rule"].accept_floor == 106_000_000


async def test_evaluate_sell_list_only_lists_at_value_without_waiting_or_accepting_offers():
    only = rule(
        trigger_kind="none",
        trigger_percent=None,
        threshold_amount=100_000_000,
        price_mode="market_value",
        list_now=True,
    )
    repo, state, _ = await run(only)
    assert [b for _, _, b in state["writes"]] == [{"playerId": "s7", "salePrice": 106_000_000}]
    stored = repo.rules[1]["rule"]
    assert (stored.state, stored.listed_price, stored.accept_floor) == (
        "executed",
        106_000_000,
        None,
    )
    assert repo.log == [(1, "list", "ok", None, 106_000_000)]


async def test_evaluate_sell_list_now_lists_below_the_threshold_then_sells_at_the_floor():
    waiting = rule(list_now=True, threshold_amount=120_000_000)
    repo, state, _ = await run(waiting)
    assert [b for _, _, b in state["writes"]] == [{"playerId": "s7", "salePrice": 120_000_000}]
    stored = repo.rules[1]["rule"]
    assert (stored.state, stored.listed_price, stored.accept_floor) == (
        "listed",
        120_000_000,
        120_000_000,
    )


async def test_evaluate_listed_accepts_best_pending_offer_at_or_above_floor():
    listed = rule(state="listed", listed_price=106_000_000, accept_floor=105_000_000, listed_at=NOW)
    offers = [
        {"id": "o1", "money": 104_000_000, "status": "pending", "marketId": "m1"},
        {"id": "o2", "money": 107_000_000, "status": "pending", "marketId": "m1"},
        {"id": "o3", "money": 108_000_000, "status": "rejected", "marketId": "m1"},
    ]
    repo, state, _ = await run(listed, offers=offers)
    assert [w[2] for w in state["writes"]] == [{"offerMoney": 107_000_000}]
    assert state["writes"][0][1].endswith("/market/m1/offer/o2/accept")
    assert repo.state() == "executed" and repo.log[-1][:3] == (1, "accept_offer", "ok")


async def test_evaluate_buy_market_bids_up_to_threshold_or_exactly_value_by_mode():
    market = [{"id": "m9", "discr": "marketPlayerLeague", "playerMaster": {"id": "8"}}]
    repo, state, _ = await run(market_rule(), market=market)
    assert [w[2] for w in state["writes"]] == [{"money": 90_000_000}]
    assert state["writes"][0][1].endswith("/market/m9/bid") and repo.state() == "executed"
    _, state, _ = await run(market_rule(price_mode="market_value"), market=market)
    assert [w[2] for w in state["writes"]] == [{"money": 88_000_000}]
    _, state, _ = await run(market_rule(bid_amount=92_000_000, max_spend=93_000_000), market=market)
    assert [w[2] for w in state["writes"]] == [{"money": 92_000_000}]


async def test_evaluate_buy_clause_pays_the_clause_after_unlock_with_confirmed_inactive_shield():
    repo, state, _ = await run(clause_rule())
    assert [w[2] for w in state["writes"]] == [{"buyoutClauseToPay": 92_000_000}]
    assert state["writes"][0][1].endswith("/buyout/s8/pay")
    assert repo.state() == "executed" and repo.log == [(1, "pay_clause", "ok", None, 92_000_000)]


async def test_evaluate_buy_clause_unknown_card_shield_is_confirmed_through_the_shield_read():
    cards = world()["cards"]
    cards["8"].pop("isShielded")
    _, state, _ = await run(clause_rule(), cards=cards)
    assert len(state["writes"]) == 1


# ---- Error paths ---- #


async def test_evaluate_sell_below_threshold_or_player_gone_never_lists():
    cards = world()["cards"]
    cards["7"]["playerMaster"]["marketValue"] = 104_000_000
    repo, state, _ = await run(rule(), cards=cards)
    assert state["writes"] == [] and repo.state() == "armed"
    cards = world()["cards"]
    cards["7"]["managerId"] = "2"
    repo, state, _ = await run(rule(), cards=cards)
    assert state["writes"] == [] and repo.state() == "failed"
    assert repo.log == [(1, "skip", "failed", "left_squad", None)]


async def test_evaluate_sell_list_now_adopts_an_existing_listing_without_a_second_write():
    on_market = [{"id": "m1", "discr": "marketPlayerTeam", "playerMaster": {"id": "7"}}]
    only = rule(
        trigger_kind="none",
        trigger_percent=None,
        threshold_amount=100_000_000,
        price_mode="market_value",
        list_now=True,
    )
    repo, state, _ = await run(only, market=on_market)
    assert state["writes"] == [] and repo.state() == "executed"
    assert repo.log == [(1, "skip", "skipped", "already_listed", None)]
    repo, state, _ = await run(rule(list_now=True), market=on_market)
    assert state["writes"] == [] and repo.state() == "listed"
    assert repo.rules[1]["rule"].accept_floor == 105_000_000


async def test_evaluate_sell_threshold_reached_on_a_listed_player_adopts_instead_of_relisting():
    on_market = [{"id": "m1", "discr": "marketPlayerTeam", "playerMaster": {"id": "7"}}]
    repo, state, _ = await run(rule(), market=on_market)
    assert state["writes"] == [] and repo.state() == "listed"


async def test_evaluate_listed_offers_below_floor_or_not_pending_are_ignored():
    listed = rule(state="listed", listed_price=106_000_000, accept_floor=105_000_000, listed_at=NOW)
    offers = [
        {"id": "o1", "money": 104_000_000, "status": "pending", "marketId": "m1"},
        {"id": "o2", "money": 120_000_000, "status": "unknown", "marketId": "m1"},
    ]
    repo, state, _ = await run(listed, offers=offers)
    assert state["writes"] == [] and repo.state() == "listed"


async def test_evaluate_listed_player_left_squad_closes_and_lapsed_listing_is_relisted():
    listed = rule(state="listed", listed_price=106_000_000, accept_floor=105_000_000, listed_at=NOW)
    cards = world()["cards"]
    cards["7"]["managerId"] = "2"
    repo, _, _ = await run(listed, cards=cards)
    assert repo.state() == "executed" and repo.log == [(1, "skip", "ok", "left_squad", None)]
    old = listed.model_copy(update={"listed_at": NOW - timedelta(hours=1)})
    repo, state, _ = await run(old)
    assert repo.state() == "listed" and repo.log[-1][1] == "list"
    assert len(state["writes"]) == 1
    on_market = [
        {"id": "m1", "discr": "marketPlayerTeam", "playerMaster": {"id": "7"}},
    ]
    repo, _, _ = await run(old, market=on_market)
    assert repo.state() == "listed"


@pytest.mark.parametrize(
    ("changes", "reason"),
    [
        ({"max_spend": 80_000_000}, "over_max_spend"),
        ({"team": {"teamMoney": 1, "teamValue": 1, "playersNumber": 20}}, "insufficient_funds"),
        ({"team": {"teamMoney": 10**9, "teamValue": 1, "playersNumber": 24}}, "squad_full"),
        ({"team": {"playersNumber": 3}}, "balance_unavailable"),
    ],
)
async def test_evaluate_buy_market_unaffordable_or_over_limit_never_bids(changes, reason):
    market = [{"id": "m9", "discr": "marketPlayerLeague", "playerMaster": {"id": "8"}}]
    rule_changes = {k: v for k, v in changes.items() if k == "max_spend"}
    world_changes = {k: v for k, v in changes.items() if k != "max_spend"}
    repo, state, _ = await run(market_rule(**rule_changes), market=market, **world_changes)
    assert state["writes"] == [] and repo.state() == "armed"
    assert [entry[3] for entry in repo.log] == [reason]


async def test_evaluate_buy_market_skips_direct_offers_own_bids_expired_and_unreached():
    base = {"id": "m9", "discr": "marketPlayerLeague", "playerMaster": {"id": "8"}}
    cases = [
        [base | {"directOffer": True}],
        [base | {"bid": {"id": "b", "money": 1}}],
        [base | {"expirationDate": (NOW - timedelta(hours=1)).isoformat()}],
        [],
    ]
    for market in cases:
        repo, state, _ = await run(market_rule(), market=market)
        assert state["writes"] == [] and repo.state() == "armed"
    cards = world()["cards"]
    cards["8"]["playerMaster"]["marketValue"] = 95_000_000
    _, state, _ = await run(market_rule(), market=[base], cards=cards)
    assert state["writes"] == []


async def test_evaluate_buy_market_bids_on_the_open_listing_when_another_has_closed():
    base = {"id": "m9", "discr": "marketPlayerLeague", "playerMaster": {"id": "8"}}
    closed = base | {"expirationDate": (NOW - timedelta(hours=1)).isoformat()}
    repo, state, _ = await run(market_rule(), market=[closed, base | {"id": "m10"}])
    assert len(state["writes"]) == 1 and repo.state() == "executed"


async def test_evaluate_buy_clause_locked_unknown_shielded_or_disabled_never_pays():
    cards = world()["cards"]
    cards["8"]["buyoutClauseLockedEndTime"] = (NOW + timedelta(minutes=2)).isoformat()
    repo, state, _ = await run(clause_rule(), cards=cards)
    assert state["writes"] == [] and repo.log == []
    assert repo.league["next_check"] == NOW + timedelta(minutes=2, seconds=5)
    cards["8"]["buyoutClauseLockedEndTime"] = (NOW + timedelta(hours=2)).isoformat()
    repo, _, _ = await run(clause_rule(), cards=cards)
    assert repo.league["next_check"] == NOW + timedelta(minutes=5)
    for patch, reason in (
        ({"buyoutClauseLockedEndTime": None}, "unlock_unknown"),
        ({"buyoutClauseLockedEndTime": "2026-11-24T10:00:00"}, "unlock_unknown"),
        ({"isShielded": True}, "shield_active_or_unknown"),
        ({"buyoutClause": 0}, "clause_unknown"),
        ({"buyoutClause": 99_000_000}, "over_max_spend"),
    ):
        cards = world()["cards"]
        cards["8"].update(patch)
        repo, state, _ = await run(clause_rule(), cards=cards)
        assert state["writes"] == [] and repo.log[0][3] == reason, patch
    leagues = world()["leagues"]
    leagues[0]["config"] = {"features": {"buyoutClause": False}}
    repo, state, _ = await run(clause_rule(), leagues=leagues)
    assert state["writes"] == [] and repo.log[0][3] == "clauses_disabled"
    cards = world()["cards"]
    cards["8"].pop("isShielded")
    _, state, _ = await run(clause_rule(), cards=cards, shield={"isShielded": None})
    assert state["writes"] == []


async def test_evaluate_buy_clause_ownership_changed_or_already_owned_fails_the_rule():
    cards = world()["cards"]
    cards["8"]["playerTeamId"] = "other"
    repo, state, _ = await run(clause_rule(), cards=cards)
    assert state["writes"] == [] and repo.log == [(1, "skip", "failed", "ownership_changed", None)]
    cards = world()["cards"]
    cards["8"]["managerId"] = "1"
    repo, state, _ = await run(clause_rule(), cards=cards)
    assert state["writes"] == [] and repo.log[0][3] == "already_owned"


async def test_evaluate_write_failure_marks_failed_and_is_never_retried():
    repo, state, executor = await run(rule(), write_status=500)
    assert repo.state() == "failed" and len(state["writes"]) == 1
    assert repo.log == [(1, "list", "failed", "fantasy_error", 106_000_000)]
    repo.league["next_check"] = NOW - timedelta(minutes=1)
    await executor.evaluate("alice", LEAGUE)
    assert len(state["writes"]) == 1


async def test_evaluate_write_unauthorized_releases_claim_then_retries_with_forced_refresh():
    repo, state, _ = await run(rule(), write_status=401)
    assert len(state["writes"]) == 2 and state["redeems"] == [False, True]
    assert repo.state() == "armed" and repo.league["status"] == "needs_reauth"
    assert repo.log == []


async def test_evaluate_revoked_grant_pauses_the_league_without_any_write():
    repo, state, _ = await run(rule(), bearer_status=401)
    assert state["writes"] == [] and repo.league["status"] == "needs_reauth"


async def test_evaluate_rejected_service_credential_degrades_instead_of_asking_to_relink():
    repo, state, _ = await run(rule(), bearer_status=401, bearer_body={"error": "unauthorized"})
    assert state["writes"] == [] and repo.league["status"] == "degraded"


async def test_evaluate_write_rate_limited_releases_claim_and_backs_off():
    repo, state, _ = await run(rule(), write_status=429)
    assert len(state["writes"]) == 1 and repo.state() == "armed"
    assert repo.league["status"] == "degraded" and repo.log == []


async def test_evaluate_write_unexpected_error_fails_rule_without_retry():
    repo, state, executor = await run(rule(), write_status=404)
    assert repo.state() == "failed" and len(state["writes"]) == 1
    repo.league["next_check"] = NOW - timedelta(minutes=1)
    await executor.evaluate("alice", LEAGUE)
    assert len(state["writes"]) == 1


async def test_evaluate_unexpected_market_shape_degrades_with_backoff_and_no_write():
    repo, state, _ = await run(market_rule(), market={"marketPlayers": "x"})
    assert state["writes"] == [] and repo.league["status"] == "degraded"
    assert repo.league["next_check"] == NOW + timedelta(seconds=300)


async def test_evaluate_not_a_member_pauses_the_league():
    repo, state, _ = await run(rule(), leagues=[])
    assert state["writes"] == [] and repo.league["status"] == "not_member"


# ---- Edge cases ---- #


async def test_evaluate_concurrent_passes_claim_each_write_exactly_once():
    repository = MemoryRepository(rule())
    state = world()
    executor = build(repository, state)
    await asyncio.gather(*(executor.evaluate("alice", LEAGUE) for _ in range(4)))
    assert len(state["writes"]) == 1 and repository.rules[1]["version"] == 3


async def test_evaluate_expired_deadline_stale_claim_and_idle_league_are_closed():
    repo, state, _ = await run(rule(expires_at=NOW - timedelta(minutes=1)))
    assert repo.state() == "expired" and state["writes"] == [] and repo.log[0][1] == "expire"
    stuck = rule(state="executing")
    repository = MemoryRepository(stuck)
    repository.rules[1]["claimed_at"] = NOW - timedelta(minutes=11)
    await build(repository, world()).evaluate("alice", LEAGUE)
    assert repository.state() == "failed" and repository.log[0][3] == "interrupted"
    repository = MemoryRepository(stuck)
    repository.rules[1]["claimed_at"] = NOW - timedelta(minutes=1)
    await build(repository, world()).evaluate("alice", LEAGUE)
    assert repository.state() == "executing"
    repository = MemoryRepository(rule(state="cancelled"))
    state = world()
    await build(repository, state).evaluate("alice", LEAGUE)
    assert repository.league["status"] == "inactive" and state["reads"] == 0


async def test_evaluate_not_due_or_paused_league_does_nothing():
    repository = MemoryRepository(rule())
    repository.league["next_check"] = NOW + timedelta(minutes=1)
    state = world()
    await build(repository, state).evaluate("alice", LEAGUE)
    repository.league.update(next_check=NOW - timedelta(minutes=1), status="needs_reauth")
    await build(repository, state).evaluate("alice", LEAGUE)
    assert state["redeems"] == [] and state["writes"] == []


async def test_evaluate_sell_card_without_player_team_id_confirms_the_entry_on_the_roster():
    cards = world()["cards"]
    cards["7"] = {k: v for k, v in cards["7"].items() if k != "playerTeamId"}
    roster = [{"playerTeamId": "s7", "playerMaster": {"id": "7"}}]
    team = {"teamMoney": 1, "players": roster}
    repo, state, _ = await run(rule(), cards=cards, team=team)
    assert len(state["writes"]) == 1 and repo.state() == "listed"
    other = [{"playerTeamId": "s9", "playerMaster": {"id": "7"}}]
    repo, state, _ = await run(rule(), cards=cards, team={"teamMoney": 1, "players": other})
    assert state["writes"] == [] and repo.state() == "failed"


async def test_evaluate_roster_fallback_proves_ownership_when_membership_has_no_manager():
    leagues = world()["leagues"]
    leagues[0]["team"] = {"id": "t1"}
    team = {
        "teamMoney": 1,
        "players": [{"playerTeamId": "s7", "playerMaster": {"id": "7"}}],
    }
    repo, state, _ = await run(rule(), leagues=leagues, team=team)
    assert len(state["writes"]) == 1 and repo.state() == "listed"
    repo, state, _ = await run(rule(), leagues=leagues, team={"teamMoney": 1, "players": []})
    assert state["writes"] == [] and repo.state() == "failed"


def test_writer_exposes_only_the_four_confirmed_writes():
    public = {name for name in dir(AutoMarketWriter) if not name.startswith("_")}
    assert public == {"list_player", "accept_offer", "place_bid", "pay_clause"}
