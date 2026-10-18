"""Authenticated snapshot integration; all provider operations must be GETs."""

# ---- Mocks, fixtures & helpers ---- #

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from typing import Literal
from unittest.mock import AsyncMock

import httpx
import pytest
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.main import create_app
from fantasy_api.repositories.lineup_builder import LineupBuilderRepository
from fantasy_api.schemas.player_stats import (
    Competition,
    FixtureRef,
    FixtureStats,
    FixtureStatsRow,
    FormStat,
    Hierarchy,
    Injury,
    InjuryHistoryEntry,
    InjuryRiskInfo,
    MarketPreset,
    MarketSeriesPoint,
    MarketWindow,
    MatchWeather,
    MaxProfitableBid,
    PlayerDetailResponse,
    PlayerFixtureStatsResponse,
    PlayerMarketResponse,
    PlayerProfileResponse,
    PlayerRef,
    StartProbability,
    Travel,
    UpcomingMatch,
    UpcomingMatchesResponse,
    WeatherSnapshot,
)
from fantasy_api.services.lineup_builder import LineupBuilderService
from fastapi.testclient import TestClient
from jwt_mint import mint_internal_jwt
from test_calendar import rsa_pems as calendar_rsa_pems
from test_container import TEST_LALIGA_BEARER, build_test_container


@pytest.fixture
def rsa_pems() -> tuple[str, str]:
    """Reuse the calendar suite's local signing keys for route authorization."""
    return calendar_rsa_pems.__wrapped__()


def _detail(pid: str, day: datetime, now: datetime) -> PlayerDetailResponse:
    """Return valid source segments with explicit five-day market coverage."""
    envelope = dict(player_id=pid, season="2026-27", generated_at=now)
    return PlayerDetailResponse(
        **envelope,
        player=PlayerRef(id=pid),
        fixtures=PlayerFixtureStatsResponse(
            **envelope,
            fixtures=[
                FixtureStatsRow(
                    fixture=FixtureRef(
                        date=(day - timedelta(days=8)).date(), competition=Competition.LALIGA
                    ),
                    minutes_played=90,
                    stats=FixtureStats(),
                )
            ],
        ),
        market=PlayerMarketResponse(
            **envelope,
            window=MarketWindow(
                preset=MarketPreset.D5,
                **{"from": (now - timedelta(days=5)).date()},
                to=now.date(),
                days=5,
                start_value=100,
                end_value=110,
                delta_rel=10,
                series=[
                    MarketSeriesPoint(date=(now - timedelta(days=i)).date(), value=100)
                    for i in range(6)
                ],
            ),
        ),
        profile=PlayerProfileResponse(
            **envelope,
            availability={"status": "available"},
            injury=Injury(),
            injury_risk=InjuryRiskInfo(level="low", raw="Bajo"),
            start_probability=StartProbability(matchweek=10, percent=95),
            max_profitable_bid=MaxProfitableBid(),
            hierarchy=Hierarchy(label="Clave"),
            form=FormStat(rating="good"),
        ),
    )


def _client(
    rsa_pems: tuple[str, str],
    *,
    response: object = None,
    cash: int | None = 1000,
    investment: int | None = 0,
    bid_state: str = "empty",
    listing_bid: bool = False,
    listing_bid_money: int = 10,
    shield: bool = False,
    upstream_status: int = 200,
    malformed_json: bool = False,
    auth_error: bool = False,
    source_players: bool = False,
    offers: bool = False,
    stats_failure: str | None = None,
    standings_failure: bool = False,
    started_round: str | None = None,
    previous_round_state: str | None = None,
    roster_state: str = "complete",
    provide_catalog: bool = False,
    catalog_missing_entry: bool = False,
    extra_owned: bool = False,
    external_sparse: bool = False,
    external_catalog_missing: bool = False,
    market_route_state: str | None = None,
    opponent_shield_missing: bool = False,
    shield_lookup_state: str = "clear",
    opponent_lock_offset_hours: int | None = None,
    official_average: float | None = None,
    catalog_average: float | None = None,
    season_total: float | None = None,
    season_matches: int | None = None,
    weather_code: int | None = None,
    weather_description: str | None = None,
    injury_history_coverage: Literal["complete", "partial", "unknown"] = "unknown",
    injury_history_days: tuple[int, ...] = (),
) -> tuple[TestClient, str, list[httpx.Request]]:
    """Wire real auth/Fantasy clients with typed football segment stubs."""
    private, public = rsa_pems
    now = datetime.now(UTC)
    first = now + timedelta(days=7)
    requests = []
    roster = [
        {
            "playerTeamId": f"slot-{i}",
            "isShielded": shield,
            "buyoutClauseLockedEndTime": (first - timedelta(days=3)).isoformat(),
            "playerMaster": {
                "id": str(i),
                "name": f"Player {i}",
                "teamId": 1,
                "positionId": position,
                "marketValue": 100,
                "averagePoints": official_average,
            },
        }
        for i, position in enumerate([1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4], start=1)
    ]
    if extra_owned:
        for player_id, position in ((12, 3), (13, 4)):
            roster.append(
                {
                    **roster[-1],
                    "playerTeamId": f"slot-{player_id}",
                    "playerMaster": {
                        **roster[-1]["playerMaster"],
                        "id": str(player_id),
                        "positionId": position,
                        "name": f"Player {player_id}",
                    },
                }
            )

    catalog_rows = [
        {
            **slot["playerMaster"],
            "teamId": "1",
            "positionId": str(slot["playerMaster"]["positionId"]),
            "marketValue": "100",
            "averagePoints": catalog_average,
        }
        for slot in roster
    ]
    if source_players and not external_catalog_missing:
        catalog_rows += [
            {"id": player_id, "teamId": "1", "positionId": "4", "marketValue": "100"}
            for player_id in ("99", "199")
        ]

    def handler(request: httpx.Request) -> httpx.Response:
        """Assert authentication separation and fail if any provider write occurs."""
        assert request.method == "GET"
        requests.append(request)
        path = request.url.path
        public_path = (
            path.endswith("/week/current")
            or path.endswith("/calendar")
            or path.endswith("/players")
        )
        assert request.headers.get("authorization") == (
            None if public_path else f"Bearer {TEST_LALIGA_BEARER}"
        )
        assert request.headers.get("x-lang") == "es"
        if path.endswith("/leagues") and malformed_json:
            return httpx.Response(200, text="not JSON")
        if path.endswith("/leagues"):
            return httpx.Response(
                upstream_status,
                json=(
                    response
                    if response is not None
                    else [
                        {
                            "id": "league",
                            "team": {"id": "caller"},
                            "config": {"features": {"buyoutClause": True}},
                        }
                    ]
                ),
            )
        if path.endswith("/players"):
            return httpx.Response(
                200, json=catalog_rows[1:] if catalog_missing_entry else catalog_rows
            )
        if path.endswith("/money"):
            return httpx.Response(200, json={"teamMoney": cash, "teamInvestment": investment})
        if path.endswith("/check-shield"):
            if shield_lookup_state == "error":
                return httpx.Response(503, json={"secret": TEST_LALIGA_BEARER})
            return httpx.Response(
                200,
                json={
                    "isShielded": {
                        "clear": False,
                        "active": True,
                        "unknown": None,
                    }[shield_lookup_state]
                },
            )
        if path.endswith("/market"):
            market_payload = {
                "marketPlayers": (
                    [
                        {
                            "id": "listing",
                            "discr": "market_player",
                            "directOffer": False,
                            "expirationDate": (now + timedelta(days=1)).isoformat(),
                            "playerMaster": {
                                "id": "99",
                                "name": "Market player",
                                "teamId": 1,
                                "positionId": 4,
                                "marketValue": 100,
                            },
                        }
                    ]
                    if source_players
                    else []
                ),
            }
            if bid_state != "missing":
                market_payload["userBids"] = (
                    [{"id": "bid", "money": 10}]
                    if bid_state == "pending"
                    else [{"id": "bid"}] if bid_state == "incomplete" else []
                )
            if listing_bid:
                market_payload["marketPlayers"].append(
                    {"id": "bid-listing", "bid": {"id": "bid", "money": listing_bid_money}}
                )
            if external_sparse and source_players:
                market_payload["marketPlayers"][0]["playerMaster"].update(
                    teamId=None, positionId=None, marketValue=None
                )
            if market_route_state and source_players:
                listing = market_payload["marketPlayers"][0]
                changes = {
                    "league_auction": {
                        "discr": "marketPlayerLeague",
                        "directOffer": None,
                        "salePrice": 100,
                        "status": "on_sale",
                    },
                    "team_type_without_owner": {"discr": "marketPlayerTeam"},
                    "type_missing": {"discr": None},
                    "free_offer_enabled": {"directOffer": True},
                    "offer_unknown": {"directOffer": None},
                    "seller_offer": {
                        "directOffer": True,
                        "playerTeam": {"playerTeamId": "seller-slot"},
                    },
                    "owner_auction_flag": {
                        "directOffer": False,
                        "playerTeam": {"playerTeamId": "seller-slot"},
                    },
                    "type_unknown": {"discr": "unknown"},
                    "expiry_unknown": {"expirationDate": None},
                    "expiry_naive": {
                        "expirationDate": (now + timedelta(days=1)).replace(tzinfo=None).isoformat()
                    },
                    "expired": {"expirationDate": (now - timedelta(seconds=1)).isoformat()},
                    "settles_late": {"expirationDate": (first + timedelta(seconds=1)).isoformat()},
                    "settles_at_kickoff": {"expirationDate": first.isoformat()},
                }
                listing.update(changes[market_route_state])
            return httpx.Response(200, json=market_payload)
        if path.endswith("/week/current"):
            return httpx.Response(
                200,
                json={
                    "weekNumber": 10,
                    "isLive": started_round == "live",
                    "openingWeekDate": (
                        now - timedelta(hours=12) if started_round else first
                    ).isoformat(),
                },
            )
        if path.endswith("/calendar"):
            week = int(request.url.params["weekNumber"])
            if started_round and week <= 10:
                return httpx.Response(
                    200,
                    json=[
                        {
                            "id": str(week),
                            "matchDate": (
                                now - timedelta(hours=12)
                                if week == 10
                                else first - timedelta(days=8 + (9 - week) * 7)
                            ).isoformat(),
                            "matchState": (
                                7
                                if started_round == "finished_match" and week == 10
                                else (
                                    3
                                    if week == 10
                                    else (
                                        1
                                        if week == 9 and previous_round_state == "unfinished"
                                        else 7
                                    )
                                )
                            ),
                            "localId": 1,
                            "visitorId": 2,
                            "localScore": (
                                None if week == 9 and previous_round_state == "missing_score" else 0
                            ),
                            "visitorScore": 1,
                        }
                    ],
                )
            return httpx.Response(
                200,
                json=[
                    {"matchDate": first.isoformat(), "matchState": 1, "localId": 1, "visitorId": 2}
                ],
            )
        if path.endswith("/teams"):
            return httpx.Response(200, json=[{"id": "caller"}, {"id": "opponent"}])
        if path.endswith("/teams/opponent"):
            other = {
                **roster[-1],
                "playerTeamId": "opponent-slot",
                "buyoutClause": 150,
                "playerMaster": {**roster[-1]["playerMaster"], "id": "199"},
            }
            if external_sparse:
                other["playerMaster"].update(teamId=None, positionId=None, marketValue=None)
            if opponent_shield_missing:
                other.pop("isShielded")
            if opponent_lock_offset_hours is not None:
                other["buyoutClauseLockedEndTime"] = (
                    first + timedelta(hours=opponent_lock_offset_hours)
                ).isoformat()
            return httpx.Response(200, json={"id": "opponent", "players": [other]})
        if path.endswith("/offer"):
            return httpx.Response(
                200,
                json=(
                    [{"money": 100, "status": "pending", "expirationDate": first.isoformat()}]
                    if offers
                    else []
                ),
            )
        if roster_state == "club_missing":
            roster[0]["playerMaster"]["teamId"] = None
        if roster_state == "position_missing":
            roster[0]["playerMaster"]["positionId"] = None
        if roster_state == "valuation_missing":
            roster[0]["playerMaster"]["marketValue"] = None
        return httpx.Response(
            200,
            json={
                "id": "caller",
                "players": None if roster_state == "missing" else roster,
                "loanedPlayers": [{"id": "loan"}] if roster_state == "loaned" else [],
            },
        )

    container = build_test_container(
        public,
        fantasy_handler=httpx.MockTransport(handler),
        auth_handler=(
            httpx.MockTransport(lambda _: httpx.Response(401, json={"error": "needs_reauth"}))
            if auth_error
            else None
        ),
    )

    def source_detail(pid, query):
        """Simulate source failure while retaining other detail segments."""
        detail = _detail(pid, first, now)
        if started_round:
            detail.fixtures.fixtures[0].stats.dazn_points.dazn_points = 1
            current_match = FixtureStatsRow(
                fixture=FixtureRef(
                    date=(first - timedelta(days=8)).date(),
                    competition=Competition.LALIGA,
                    matchweek=10,
                ),
                minutes_played=90,
                stats=FixtureStats(),
            )
            current_match.stats.dazn_points.dazn_points = 99
            detail.fixtures.fixtures.insert(0, current_match)
        detail.profile.fantasy_season_total = season_total
        detail.profile.fantasy_season_matches = season_matches
        detail.profile.injury_history_coverage = injury_history_coverage
        detail.profile.injury_history = [
            InjuryHistoryEntry(start=(first - timedelta(days=days)).date())
            for days in injury_history_days
        ]
        if weather_description is not None:
            detail.upcoming = UpcomingMatchesResponse(
                player_id=pid,
                season="2026-27",
                generated_at=now,
                matches=[
                    UpcomingMatch(
                        fixture=FixtureRef(competition=Competition.LALIGA, matchweek=10),
                        kickoff=first,
                        weather=MatchWeather(
                            snapshot=WeatherSnapshot(
                                temperature_c=20,
                                condition=weather_description,
                                condition_code=weather_code,
                                forecast_for=first,
                            )
                        ),
                        travel=Travel(),
                    )
                ],
            )
        if stats_failure == "market":
            return detail.model_copy(update={"market": None})
        if stats_failure == "profile":
            return detail.model_copy(update={"profile": None})
        if stats_failure == "recent":
            return detail.model_copy(update={"fixtures": None})
        if stats_failure in {
            "widget_missing_ok",
            "widget_missing_doubtful",
            "widget_missing_unknown",
            "widget_missing_injury",
        }:
            detail.profile.availability = None
            detail.profile.injury.fantasy_status = (
                "doubtful"
                if stats_failure == "widget_missing_doubtful"
                else "ok" if stats_failure != "widget_missing_unknown" else None
            )
            detail.profile.injury.active = stats_failure == "widget_missing_injury"
        if stats_failure == "appearance":
            for row in detail.fixtures.fixtures:
                if row.fixture.matchweek != 10:
                    row.minutes_played = 0
        return detail

    stats = SimpleNamespace(detail=AsyncMock(side_effect=source_detail))
    if standings_failure and not started_round:
        stats.detail.side_effect = AssertionError("Do not evaluate players without club histories")
    club = SimpleNamespace(
        position=1,
        last5_matches=[SimpleNamespace(kickoff_at=first - timedelta(days=8), result="W")],
    )
    club.team = SimpleNamespace(id=1)
    standings = SimpleNamespace(get_standings=AsyncMock(return_value=SimpleNamespace(rows=[club])))
    if standings_failure:
        standings.get_standings.side_effect = UpstreamError(
            TEST_LALIGA_BEARER, status_code=502, category="standings_error"
        )
    repo = LineupBuilderRepository(
        container.leagues_service,
        container.teams_service,
        container.calendar_service,
        container.market_service,
        stats,
        standings,
        1,
        players=container.players_service if provide_catalog else None,
        buyout=container.buyout_service,
    )
    container.lineup_builder_service = LineupBuilderService(repo)
    return (
        TestClient(create_app(container.settings, container)),
        mint_internal_jwt(private),
        requests,
    )


# ---- Happy path ---- #


def test_build_lineup_authenticated_reads_only_returns_owned_xi(rsa_pems) -> None:
    client, jwt, requests = _client(rsa_pems)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"]},
        )
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["rules_version"] == "2026-10-15.1"
    assert body["team_id"] == "caller"
    assert body["search_complete"] is True
    assert len(body["candidates"][0]["starters"]) == 11
    first = body["candidates"][0]["starters"][0]
    probability = next(
        criterion
        for section in first["sections"]
        for criterion in section["criteria"]
        if criterion["rule_id"] == "role_and_starting_probability"
    )
    assert Decimal(probability["lineup"]) == 7
    assert Decimal(probability["lineup_upper"]) == 8
    assert body["candidates"][0]["trading_plan"]["squad_count"] == 11
    assert body["candidates"][0]["trading_plan"]["projected_cash"] == 1000
    assert all(request.method == "GET" for request in requests)
    assert TEST_LALIGA_BEARER not in result.text


@pytest.mark.parametrize(
    "coverage,days,points,observed",
    [
        ("complete", (40, 8), -1, "8"),
        ("complete", (), 3, "complete_empty"),
        ("partial", (8,), None, None),
        ("partial", (), None, None),
        ("unknown", (8,), None, None),
        ("unknown", (), None, None),
    ],
)
def test_build_lineup_injury_history_coverage_scores_only_verified_history(
    rsa_pems, coverage, days, points, observed
) -> None:
    client, jwt, _ = _client(rsa_pems, injury_history_coverage=coverage, injury_history_days=days)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"]},
        )
    assert result.status_code == 200, result.text
    for player in result.json()["candidates"][0]["starters"]:
        section = next(section for section in player["sections"] if section["section"] == "injury")
        if points is None:
            assert section["criteria"] == []
            assert "injury_history_unknown" in player["omissions"]
            assert Decimal(section["effective_weight"]) == 0
        else:
            assert len(section["criteria"]) == 1
            criterion = section["criteria"][0]
            assert criterion["rule_id"] == "injury_history"
            assert Decimal(criterion["lineup"]) == points
            assert criterion["observed"] == observed
            assert "injury_history_unknown" not in player["omissions"]


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "body,status",
    [({"user_id": "other"}, 422), ({"sources": []}, 422), ({"max_candidates": True}, 422)],
)
def test_build_lineup_invalid_body_rejects_before_upstream(rsa_pems, body, status) -> None:
    client, jwt, requests = _client(rsa_pems)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json=body,
        )
    assert result.status_code == status
    assert requests == []


def test_build_lineup_missing_jwt_rejects_before_upstream(rsa_pems) -> None:
    client, _, requests = _client(rsa_pems)
    with client:
        result = client.post("/lineup-builder/leagues/league/build", json={})
    assert result.status_code == 401
    assert requests == []


@pytest.mark.parametrize("response,status", [([], 404), ("bad", 502)])
def test_build_lineup_missing_membership_or_bad_shape_fails_closed(
    rsa_pems, response, status
) -> None:
    client, jwt, requests = _client(rsa_pems, response=response)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={},
        )
    assert result.status_code == status
    assert len(requests) == 1


@pytest.mark.parametrize("investment", [None, 1, 100])
def test_build_lineup_optional_investment_without_bids_does_not_block(rsa_pems, investment) -> None:
    client, jwt, _ = _client(rsa_pems, investment=investment)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"]},
        )
    assert result.status_code == 200
    assert result.json()["candidates"][0]["trading_plan"]["projected_cash"] == 1000


@pytest.mark.parametrize(
    "options,reason",
    [
        ({"cash": None}, "team_cash_missing"),
        ({"bid_state": "incomplete"}, "pending_bid_details_missing"),
        (
            {"bid_state": "pending", "listing_bid": True, "listing_bid_money": 20},
            "pending_bid_details_conflict",
        ),
    ],
)
def test_build_lineup_unresolved_finances_reports_specific_safe_reason(
    rsa_pems, options, reason
) -> None:
    client, jwt, _ = _client(rsa_pems, **options)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={},
        )
    assert result.status_code == 503
    assert result.json()["error"] == "financial_data_unavailable"
    assert result.json()["diagnostics"] == [{"code": reason, "player_id": None}]
    assert TEST_LALIGA_BEARER not in result.text


@pytest.mark.parametrize(
    "preferences,code",
    [
        ({"mandatory_player_ids": ["absent"]}, "mandatory_player_conflict"),
        ({"formations": ["3,3,4"]}, "formation_unavailable"),
    ],
)
def test_build_lineup_mandatory_or_entitlement_conflict_is_explicit(
    rsa_pems, preferences, code
) -> None:
    client, jwt, _ = _client(rsa_pems)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json=preferences,
        )
    assert result.status_code == 409
    assert result.json()["error"] == code


@pytest.mark.parametrize("mandatory", [[], ["1"]])
def test_build_lineup_standings_failure_returns_source_outage_before_player_evaluation(
    rsa_pems, mandatory
) -> None:
    client, jwt, _ = _client(rsa_pems, standings_failure=True, source_players=True)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={
                "sources": ["owned", "market", "opponents"],
                "allow_buying": True,
                "mandatory_player_ids": mandatory,
            },
        )
    assert result.status_code == 503
    assert result.json()["error"] == "standings_unavailable"
    assert result.json()["diagnostics"] == [{"code": "standings_unavailable", "player_id": None}]
    assert TEST_LALIGA_BEARER not in result.text


# ---- Edge cases ---- #


@pytest.mark.parametrize("started_round", ["live", "kickoff", "finished_match"])
@pytest.mark.parametrize("standings_failure", [False, True])
def test_build_lineup_started_round_uses_previous_round_matches(
    rsa_pems, started_round, standings_failure
) -> None:
    client, jwt, requests = _client(
        rsa_pems, started_round=started_round, standings_failure=standings_failure
    )
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"]},
        )
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["target"]["week"] == 11
    assert {"code": "recent_matches_previous_round", "player_id": None} in body["diagnostics"]
    for player in body["candidates"][0]["starters"]:
        criteria = {c["rule_id"]: c for s in player["sections"] for c in s["criteria"]}
        assert criteria["club_results"]["observed"] == str(("L",) * 5)
        assert criteria["club_results"]["source"] == "fantasy_calendar"
        assert criteria["dazn_average"]["observed"] == "1"
        assert ("club_position" in player["omissions"]) == standings_failure
    weeks = {
        int(request.url.params["weekNumber"])
        for request in requests
        if request.url.path.endswith("/calendar")
    }
    assert set(range(1, 12)) == weeks
    assert all(request.method == "GET" for request in requests)


def test_build_lineup_started_round_without_previous_appearance_does_not_use_live_match(
    rsa_pems,
) -> None:
    client, jwt, _ = _client(rsa_pems, started_round="live", stats_failure="appearance")
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={},
        )
    assert result.status_code == 409
    assert result.json()["error"] == "no_feasible_lineup"
    assert any(d["code"] == "no_recent_appearance" for d in result.json()["diagnostics"])


@pytest.mark.parametrize(
    "previous_state,status,code",
    [
        ("unfinished", 409, "no_feasible_lineup"),
        ("missing_score", 503, "recent_matches_unavailable"),
    ],
)
def test_build_lineup_previous_round_unverified_result_is_not_used(
    rsa_pems, previous_state, status, code
) -> None:
    client, jwt, _ = _client(rsa_pems, started_round="live", previous_round_state=previous_state)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={},
        )
    assert result.status_code == status
    assert result.json()["error"] == code


@pytest.mark.parametrize("shield", [False, True])
def test_build_lineup_unknown_owned_shield_omits_only_protection(rsa_pems, shield) -> None:
    client, jwt, _ = _client(rsa_pems, shield=shield)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"]},
        )
    assert result.status_code == 200
    starters = result.json()["candidates"][0]["starters"]
    assert all(("owned_protection_unknown" in p["omissions"]) == shield for p in starters)


@pytest.mark.parametrize(
    "options,code,status",
    [
        ({"auth_error": True}, "needs_reauth", 401),
        ({"upstream_status": 500}, "fantasy_error", 500),
        ({"malformed_json": True}, "fantasy_error", 502),
    ],
)
def test_build_lineup_provider_failures_are_sanitized(rsa_pems, options, code, status) -> None:
    client, jwt, _ = _client(rsa_pems, **options)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={},
        )
    assert result.status_code == status
    assert result.json()["error"] == code
    assert TEST_LALIGA_BEARER not in result.text


@pytest.mark.parametrize("failure", ["market", "profile", "recent", "appearance"])
def test_build_lineup_partial_required_segments_cannot_produce_fake_success(
    rsa_pems, failure
) -> None:
    client, jwt, _ = _client(rsa_pems, stats_failure=failure)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={},
        )
    assert result.status_code == 409
    assert result.json()["error"] == "no_feasible_lineup"


@pytest.mark.parametrize("source,mandatory", [("market", "99"), ("opponents", "199")])
def test_build_lineup_external_mandatory_player_has_conditional_acquisition(
    rsa_pems, source, mandatory
) -> None:
    client, jwt, requests = _client(rsa_pems, source_players=True)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={
                "formations": ["4,4,2"],
                "sources": ["owned", source],
                "allow_buying": True,
                "mandatory_player_ids": [mandatory],
                "include_trading_purchases": True,
            },
        )
    assert result.status_code == 200, result.text
    candidate = result.json()["candidates"][0]
    assert candidate["resource_group"] == "external"
    assert candidate["trading_plan"]["acquisitions"][0]["player_id"] == mandatory
    assert all(request.method == "GET" for request in requests)


@pytest.mark.parametrize("source", ["market", "opponents"])
def test_build_lineup_external_proposals_survive_owned_result_priority(rsa_pems, source) -> None:
    client, jwt, requests = _client(rsa_pems, source_players=True, extra_owned=True)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"], "sources": ["owned", source], "allow_buying": True},
        )
    assert result.status_code == 200, result.text
    candidates = result.json()["candidates"]
    assert len(candidates) == 5
    assert [c["resource_group"] for c in candidates] == [
        "owned",
        "owned",
        "owned",
        "external",
        "external",
    ]
    assert all(c["trading_plan"]["acquisitions"] for c in candidates[3:])
    assert all(request.method == "GET" for request in requests)


def test_build_lineup_market_and_opponents_are_compared_without_mandatory_players(rsa_pems) -> None:
    client, jwt, requests = _client(rsa_pems, source_players=True, extra_owned=True)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={
                "formations": ["4,4,2"],
                "sources": ["owned", "market", "opponents"],
                "allow_buying": True,
            },
        )
    assert result.status_code == 200, result.text
    candidates = result.json()["candidates"]
    assert len(candidates) == 5
    for source in ("market", "opponents"):
        assert any(any(p["source"] == source for p in c["starters"]) for c in candidates)
    assert all(request.method == "GET" for request in requests)


@pytest.mark.parametrize("weak_player,strong_player", [("99", "199"), ("199", "99")])
def test_build_lineup_weaker_source_does_not_displace_better_external_lineups(
    rsa_pems, monkeypatch, weak_player, strong_player
) -> None:
    original_detail = _detail

    def detail_with_weak_player(pid, day, now):
        """Give one acquisition a low starting probability and reserve role."""
        detail = original_detail(pid, day, now)
        if pid == weak_player:
            detail.profile.start_probability.percent = 0
            detail.profile.hierarchy.label = "Reserva"
            detail.profile.form.rating = "bad"
        return detail

    monkeypatch.setattr(f"{__name__}._detail", detail_with_weak_player)
    client, jwt, requests = _client(rsa_pems, source_players=True, extra_owned=True, cash=100)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={
                "formations": ["4,4,2"],
                "sources": ["owned", "market", "opponents"],
                "allow_buying": True,
            },
        )
    assert result.status_code == 200, result.text
    body = result.json()
    candidates = body["candidates"]
    assert body["search_complete"]
    assert [c["resource_group"] for c in candidates] == ["owned"] * 3 + ["external"] * 2
    for candidate in candidates[3:]:
        acquisitions = candidate["trading_plan"]["acquisitions"]
        assert [p["player_id"] for p in acquisitions] == [strong_player]
        assert all(p["player_id"] != weak_player for p in candidate["starters"])
        assert candidate["trading_plan"]["projected_cash"] == 0
    assert all(request.method == "GET" for request in requests)


def test_build_lineup_seven_total_keeps_only_improving_acquisitions(rsa_pems) -> None:
    client, jwt, requests = _client(rsa_pems, source_players=True, extra_owned=True, cash=100)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={
                "formations": ["4,4,2"],
                "sources": ["owned", "market", "opponents"],
                "allow_buying": True,
                "max_candidates": 7,
            },
        )
    assert result.status_code == 200, result.text
    candidates = result.json()["candidates"]
    assert [c["resource_group"] for c in candidates] == ["owned"] * 4 + ["external"] * 3
    baseline = Decimal(candidates[0]["total_lineup_score"])
    assert all(Decimal(c["total_lineup_score"]) > baseline for c in candidates[4:])
    assert all(request.method == "GET" for request in requests)


@pytest.mark.parametrize("source", ["market", "opponents"])
@pytest.mark.parametrize("missing_catalog", [False, True])
def test_build_lineup_sparse_external_sources_require_verified_catalog_identity(
    rsa_pems, source, missing_catalog
) -> None:
    client, jwt, requests = _client(
        rsa_pems,
        source_players=True,
        external_sparse=True,
        provide_catalog=True,
        external_catalog_missing=missing_catalog,
    )
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"], "sources": ["owned", source], "allow_buying": True},
        )
    assert result.status_code == 200, result.text
    body = result.json()
    assert any(c["resource_group"] == "external" for c in body["candidates"]) == (
        not missing_catalog
    )
    assert sum(request.url.path.endswith("/players") for request in requests) == 1
    assert (
        any(d["code"] == "player_identity_unavailable" for d in body["diagnostics"])
        == missing_catalog
    )


def test_build_lineup_sales_permission_does_not_execute_offer_acceptance(rsa_pems) -> None:
    client, jwt, requests = _client(rsa_pems, offers=True, source_players=True, cash=0)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={
                "formations": ["4,4,2"],
                "sources": ["owned", "market"],
                "allow_buying": True,
                "allow_selling": True,
                "mandatory_player_ids": ["99"],
            },
        )
    assert result.status_code == 200, result.text
    assert len(result.json()["candidates"][0]["trading_plan"]["sales"]) == 1
    assert all(request.method == "GET" for request in requests)


def test_build_lineup_multiple_purchases_and_sales_share_one_positive_budget(rsa_pems) -> None:
    client, jwt, requests = _client(
        rsa_pems, offers=True, source_players=True, extra_owned=True, cash=10
    )
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={
                "formations": ["4,4,2"],
                "sources": ["owned", "market", "opponents"],
                "allow_buying": True,
                "allow_selling": True,
                "max_candidates": 7,
            },
        )
    assert result.status_code == 200, result.text
    candidates = [c for c in result.json()["candidates"] if c["resource_group"] == "external"]
    assert candidates
    plan = candidates[0]["trading_plan"]
    assert {p["player_id"] for p in plan["acquisitions"]} == {"99", "199"}
    assert len(plan["sales"]) == 2
    assert plan["projected_cash"] == 10
    assert plan["squad_count"] == 13
    balance = 10
    for step in plan["steps"]:
        balance += step["estimate"] if step["action"] == "sell" else -step["estimate"]
        assert step["cash_after"] == balance
        assert balance >= 0
    assert balance == 10
    assert all(request.method == "GET" for request in requests)


@pytest.mark.parametrize(
    "state,reason",
    [
        ("missing", "owned_roster_missing"),
        ("loaned", "loaned_roster_unverified"),
        ("valuation_missing", "roster_valuation_unavailable"),
    ],
)
def test_build_lineup_missing_squad_finances_does_not_blame_pending_bids(
    rsa_pems, state, reason
) -> None:
    client, jwt, _ = _client(rsa_pems, roster_state=state)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={},
        )
    assert result.status_code == 503
    assert result.json()["diagnostics"] == [{"code": reason, "player_id": None}]


@pytest.mark.parametrize(
    "bid_state,listing_bid,expected_cash,slots",
    [
        ("missing", False, 1000, 0),
        ("missing", True, 990, 1),
        ("pending", False, 990, 1),
        ("pending", True, 990, 1),
    ],
)
def test_build_lineup_listing_bids_reserve_cash_and_slots_once(
    rsa_pems, bid_state, listing_bid, expected_cash, slots
) -> None:
    client, jwt, _ = _client(rsa_pems, bid_state=bid_state, listing_bid=listing_bid)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"]},
        )
    assert result.status_code == 200, result.text
    body = result.json()
    plan = body["candidates"][0]["trading_plan"]
    assert plan["projected_cash"] == expected_cash
    assert plan["reserved_squad_slots"] == slots
    assert any(d["code"] == "cash_conservative_bid_reserve" for d in body["diagnostics"]) == bool(
        slots
    )


def test_build_lineup_failure_logs_category_without_credentials(rsa_pems, caplog) -> None:
    client, jwt, _ = _client(rsa_pems, bid_state="incomplete")
    with client:
        response = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={},
        )
    assert response.status_code == 503
    assert "lineup_builder_failed status=503 category=financial_data_unavailable" in caplog.text
    assert "pending_bid_details_missing" in caplog.text
    assert TEST_LALIGA_BEARER not in caplog.text
    assert jwt not in caplog.text


@pytest.mark.parametrize("missing", ["club_missing", "position_missing", "valuation_missing"])
def test_build_lineup_sparse_roster_joins_public_catalog_by_master_id(rsa_pems, missing) -> None:
    client, jwt, requests = _client(rsa_pems, roster_state=missing, provide_catalog=True)
    with client:
        response = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"]},
        )
    assert response.status_code == 200, response.text
    plan = response.json()["candidates"][0]["trading_plan"]
    assert plan["squad_value"] == 1100
    starter = next(p for p in response.json()["candidates"][0]["starters"] if p["player_id"] == "1")
    assert starter["player_team_id"] == "slot-1"
    assert starter["club_id"] == 1
    assert starter["position"] == 1
    assert len([r for r in requests if r.url.path.endswith("/players")]) == 1


def test_build_lineup_catalog_without_matching_id_does_not_invent_valuation(rsa_pems) -> None:
    client, jwt, _ = _client(
        rsa_pems, roster_state="valuation_missing", provide_catalog=True, catalog_missing_entry=True
    )
    with client:
        response = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={},
        )
    assert response.status_code == 503
    assert response.json()["diagnostics"][0]["code"] == "roster_valuation_unavailable"


@pytest.mark.parametrize(
    "state,points", [("widget_missing_ok", "0"), ("widget_missing_doubtful", "-5")]
)
def test_build_lineup_missing_widget_uses_explicit_catalog_availability(
    rsa_pems, state, points
) -> None:
    client, jwt, _ = _client(rsa_pems, stats_failure=state)
    with client:
        response = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"]},
        )
    assert response.status_code == 200
    criterion = next(
        c
        for s in response.json()["candidates"][0]["starters"][0]["sections"]
        for c in s["criteria"]
        if c["rule_id"] == "availability"
    )
    assert criterion["source"] == "fantasy_catalog"
    assert criterion["lineup"] == points


@pytest.mark.parametrize("state", ["widget_missing_unknown", "widget_missing_injury"])
def test_build_lineup_missing_status_or_active_injury_does_not_default_to_available(
    rsa_pems, state
) -> None:
    client, jwt, _ = _client(rsa_pems, stats_failure=state)
    with client:
        response = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"]},
        )
    assert response.status_code == 409


@pytest.mark.parametrize(
    "state,code",
    [
        ("seller_offer", "market_seller_acceptance_required"),
        ("owner_auction_flag", "market_seller_acceptance_required"),
        ("type_unknown", "market_listing_type_unknown"),
        ("type_missing", "market_listing_type_unknown"),
        ("team_type_without_owner", "market_listing_type_unknown"),
        ("expiry_unknown", "market_expiry_unknown"),
        ("expiry_naive", "market_expiry_unknown"),
        ("expired", "market_listing_expired"),
        ("settles_late", "market_settlement_after_kickoff"),
        ("settles_at_kickoff", "market_settlement_after_kickoff"),
    ],
)
def test_build_lineup_market_route_reports_exact_exclusion_reason(rsa_pems, state, code) -> None:
    client, jwt, requests = _client(rsa_pems, source_players=True, market_route_state=state)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"], "sources": ["owned", "market"], "allow_buying": True},
        )
    assert result.status_code == 200, result.text
    assert {"code": code, "player_id": "99"} in result.json()["diagnostics"]
    assert all(c["resource_group"] == "owned" for c in result.json()["candidates"])
    assert all(request.method == "GET" for request in requests)


@pytest.mark.parametrize(
    "state,code",
    [
        ("clear", None),
        ("active", "opponent_shield_active"),
        ("unknown", "opponent_shield_status_unknown"),
        ("error", "opponent_shield_status_unknown"),
    ],
)
def test_build_lineup_missing_opponent_shield_uses_read_only_verified_status(
    rsa_pems, state, code
) -> None:
    client, jwt, requests = _client(
        rsa_pems,
        source_players=True,
        opponent_shield_missing=True,
        shield_lookup_state=state,
    )
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"], "sources": ["owned", "opponents"], "allow_buying": True},
        )
    assert result.status_code == 200, result.text
    body = result.json()
    assert any(c["resource_group"] == "external" for c in body["candidates"]) == (state == "clear")
    if code:
        assert {"code": code, "player_id": "199"} in body["diagnostics"]
    shield_requests = [r for r in requests if r.url.path.endswith("/check-shield")]
    assert len(shield_requests) == 1
    assert "opponent-slot" in shield_requests[0].url.path
    assert all(request.method == "GET" for request in requests)
    assert TEST_LALIGA_BEARER not in result.text


@pytest.mark.parametrize("state", ["free_offer_enabled", "offer_unknown", "league_auction"])
def test_build_lineup_free_auction_does_not_depend_on_seller_offer_flag(rsa_pems, state) -> None:
    client, jwt, requests = _client(rsa_pems, source_players=True, market_route_state=state)
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"], "sources": ["owned", "market"], "allow_buying": True},
        )
    assert result.status_code == 200, result.text
    body = result.json()
    assert any(c["resource_group"] == "external" for c in body["candidates"])
    assert not any(d["player_id"] == "99" for d in body["diagnostics"])
    assert all(request.method == "GET" for request in requests)


@pytest.mark.parametrize(
    "offset,code",
    [
        (-24, "opponent_protection_expires_too_late"),
        (0, "opponent_protection_expires_too_late"),
        (24, "opponent_protection_active_at_kickoff"),
    ],
)
def test_build_lineup_late_opponent_lock_reports_deadline_without_shield_lookup(
    rsa_pems, offset, code
) -> None:
    client, jwt, requests = _client(
        rsa_pems,
        source_players=True,
        opponent_shield_missing=True,
        opponent_lock_offset_hours=offset,
    )
    with client:
        result = client.post(
            "/lineup-builder/leagues/league/build",
            headers={"Authorization": f"Bearer {jwt}"},
            json={"formations": ["4,4,2"], "sources": ["owned", "opponents"], "allow_buying": True},
        )
    assert result.status_code == 200, result.text
    assert {"code": code, "player_id": "199"} in result.json()["diagnostics"]
    assert not any(r.url.path.endswith("/check-shield") for r in requests)
    assert all(c["resource_group"] == "owned" for c in result.json()["candidates"])
