# ---- Mocks, fixtures & helpers ---- #

import asyncio
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from fantasy_api.api.deps import build_container
from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.clients.football import FootballClient
from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.config import Settings
from fantasy_api.domain.errors import UnauthorizedError, UpstreamError
from fantasy_api.main import create_app
from fantasy_api.schemas.standings import CompetitionStandings
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError

KEY = "provider-key-never-return"
URL = "/competitions/1/standings?mode=completed"
AUTH = {"Authorization": "Bearer valid-app-jwt"}
NOW = datetime(2026, 10, 14, 12, tzinfo=UTC)


class Validator:
    """Deterministic app identity; provider authentication is independent."""

    def validate(self, token: str) -> dict[str, str]:
        if token != "valid-app-jwt":
            raise UnauthorizedError("invalid app JWT")
        return {"sub": "app-user"}


def envelope(rows: list[object], page: int = 1, total: int = 1) -> dict[str, object]:
    """Build the documented provider response envelope for synthetic fixtures."""
    return {
        "errors": [],
        "results": len(rows),
        "paging": {"current": page, "total": total},
        "response": rows,
    }


def source_data() -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, object]]]:
    """Generate a synthetic 20-club season; no payload is a captured live response."""
    teams = [{"id": index, "name": f"Club {index}", "logo": None} for index in range(1, 21)]
    standings = []
    for index, team in enumerate(teams, start=1):
        played = 6 if index == 1 else 1 if index <= 7 else 0
        win, lose = (6, 0) if index == 1 else (0, played)
        standings.append(
            {
                "rank": index,
                "team": team,
                "points": 16 if index == 1 else 0,
                "goalsDiff": 6 if index == 1 else -lose,
                "all": {
                    "played": played,
                    "win": win,
                    "draw": 0,
                    "lose": lose,
                    "goals": {"for": win, "against": lose},
                },
                "update": NOW.isoformat(),
            }
        )
    fixtures = [
        {
            "fixture": {
                "id": index,
                "date": (NOW - timedelta(days=10 - index)).isoformat(),
                "status": {"short": "FT"},
            },
            "league": {"id": 140, "season": 2026},
            "teams": {"home": teams[0], "away": teams[index]},
            "goals": {"home": 1, "away": 0},
        }
        for index in range(1, 7)
    ]
    # In-progress and postponed results do not enter completed totals or last-five form.
    for index, status in ((70, "2H"), (71, "PST")):
        fixtures.append(
            {
                "fixture": {"id": index, "date": NOW.isoformat(), "status": {"short": status}},
                "league": {"id": 140, "season": 2026},
                "teams": {"home": teams[7], "away": teams[8]},
                "goals": {
                    "home": 2 if status == "2H" else None,
                    "away": 1 if status == "2H" else None,
                },
            }
        )
    data = {
        "/leagues": [
            {
                "league": {"id": 140, "name": "La Liga", "type": "League"},
                "country": {"name": "Spain"},
                "seasons": [{"year": 2026, "current": True}],
            }
        ],
        "/teams": [{"team": team} for team in teams],
        "/standings": [
            {
                "league": {
                    "id": 140,
                    "name": "La Liga",
                    "country": "Spain",
                    "season": 2026,
                    "standings": [standings],
                }
            }
        ],
        "/fixtures": list(reversed(fixtures)),
    }
    masters = [{"id": team["id"] + 100, "name": team["name"]} for team in teams]
    return data, masters


def make_client(
    data: dict[str, list[dict[str, Any]]] | None = None,
    masters: list[dict[str, object]] | None = None,
    *,
    failure: httpx.Response | Exception | None = None,
    key: str | None = KEY,
    overrides: dict[int, int] | None = None,
) -> tuple[TestClient, list[str]]:
    """Wire the full HTTP app with strict offline source and auth transports."""
    default_data, default_masters = source_data()
    calls: list[str] = []

    def provider(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        assert request.url.host == "v3.football.api-sports.io"
        assert request.headers["x-apisports-key"] == KEY
        assert "Authorization" not in request.headers
        assert request.headers["Accept"] == "application/json"
        if isinstance(failure, Exception):
            raise failure
        if failure is not None:
            return failure
        if request.url.path == "/leagues":
            assert request.url.params["id"] == "140"
        else:
            assert request.url.params["league"] == "140"
            assert request.url.params["season"] == "2026"
        return httpx.Response(200, json=envelope((data or default_data)[request.url.path]))

    def fantasy(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        assert request.url.path == "/api/v3/teams-master"
        assert "Authorization" not in request.headers
        return httpx.Response(200, json=masters if masters is not None else default_masters)

    def no_credentials(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("standings must not exchange a LaLiga bearer")

    settings = Settings(
        _env_file=None,
        debug=False,
        api_football_key=key,
        standings_source="api-football",
        standings_club_ids=overrides or {},
    )
    container = build_container(
        settings,
        jwt_validator=Validator(),
        football_transport=httpx.MockTransport(provider),
        laliga_client=LaligaFantasyClient(
            origin="https://fantasy.test", transport=httpx.MockTransport(fantasy)
        ),
        credentials=AuthCredentialsClient(
            base_url="https://auth.test",
            service_token="private",
            transport=httpx.MockTransport(no_credentials),
        ),
    )
    container.standings_service._clock = lambda: NOW
    return TestClient(create_app(settings, container)), calls


# ---- Happy path ---- #


def test_get_standings_complete_source_returns_all_fields_and_preserves_authoritative_points() -> (
    None
):
    # Arrange
    client, calls = make_client()
    # Act
    with client:
        response = client.get(URL, headers=AUTH)
    # Assert
    assert response.status_code == 200
    body = response.json()
    assert len(body["rows"]) == 20
    row = body["rows"][0]
    assert row["team"]["id"] == 101
    assert row["position"] == 1 and row["points"] == 16  # Preserve a synthetic deduction.
    assert (row["played"], row["won"], row["drawn"], row["lost"]) == (6, 6, 0, 0)
    assert (row["goalsFor"], row["goalsAgainst"], row["goalDifference"]) == (6, 0, 6)
    assert [match["matchId"] for match in row["last5Matches"]] == [
        f"api-football:{index}" for index in range(2, 7)
    ]
    assert row["last5Matches"][0]["opponent"]["id"] == 103
    assert row["last5Matches"][0]["result"] == "W"
    assert body["rows"][1]["last5Matches"][0]["venue"] == "away"
    assert body["rows"][7]["last5Matches"] == []
    assert body["sourceUpdatedAt"] == NOW.isoformat().replace("+00:00", "Z")
    assert body["liveAvailable"] is False and body["isProvisional"] is False
    assert set(calls) == {"/leagues", "/standings", "/teams", "/fixtures", "/api/v3/teams-master"}
    assert KEY not in response.text
    CompetitionStandings.model_validate(body)


def test_get_standings_cached_snapshot_preserves_fetch_time_without_upstream_calls() -> None:
    # Arrange
    client, calls = make_client()
    with client:
        # Act
        first = client.get(URL, headers=AUTH).json()
        count = len(calls)
        second = client.get(URL + "&season=2026", headers=AUTH).json()
        # Assert
        assert len(calls) == count
    assert first["cached"] is False and second["cached"] is True
    assert first["fetchedAt"] == second["fetchedAt"]


def test_get_standings_verified_override_maps_nonmatching_club_name() -> None:
    # Arrange
    data, masters = source_data()
    masters[0]["name"] = "Verified canonical club name"
    client, _ = make_client(data, masters, overrides={1: 101})
    # Act
    with client:
        response = client.get(URL, headers=AUTH)
    # Assert
    assert response.status_code == 200
    assert response.json()["rows"][0]["team"]["name"] == "Verified canonical club name"


# ---- Error paths ---- #


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer broken"}])
def test_get_standings_missing_or_invalid_jwt_returns_401_without_source_calls(
    headers: dict[str, str],
) -> None:
    # Arrange
    client, calls = make_client()
    # Act
    with client:
        response = client.get(URL, headers=headers)
    # Assert
    assert response.status_code == 401 and calls == []


def test_get_standings_missing_provider_key_returns_sanitized_503() -> None:
    # Arrange
    client, calls = make_client(key=None)
    # Act
    with client:
        response = client.get(URL, headers=AUTH)
    # Assert
    assert response.status_code == 503
    assert response.json()["error"] == "standings_unavailable" and calls == []


@pytest.mark.parametrize(
    "status, expected", [(401, 502), (403, 502), (429, 503), (500, 503), (503, 503)]
)
def test_get_standings_provider_http_error_returns_sanitized_status(
    status: int, expected: int
) -> None:
    # Arrange
    client, _ = make_client(failure=httpx.Response(status, json={"secret": KEY}))
    # Act
    with client:
        response = client.get(URL, headers=AUTH)
    # Assert
    assert response.status_code == expected
    assert KEY not in response.text and "secret" not in response.text


@pytest.mark.parametrize(
    "failure",
    [
        httpx.Response(200, text="<html>secret</html>"),
        httpx.Response(204),
        httpx.Response(200, json={"errors": {"token": KEY}, "response": []}),
        httpx.Response(200, json=[]),
        httpx.ReadTimeout(KEY),
    ],
)
def test_get_standings_bad_provider_success_or_timeout_returns_sanitized_error(
    failure: httpx.Response | Exception,
) -> None:
    # Arrange
    client, _ = make_client(failure=failure)
    # Act
    with client:
        response = client.get(URL, headers=AUTH)
    # Assert
    assert response.status_code in {502, 503}
    assert KEY not in response.text and "<html>" not in response.text


def test_get_standings_provider_plan_denial_returns_sanitized_503() -> None:
    # Arrange
    body = envelope([])
    body["errors"] = {"plan": f"Free plan cannot access this season: {KEY}"}
    client, calls = make_client(failure=httpx.Response(200, json=body))
    # Act
    with client:
        response = client.get(URL, headers=AUTH)
    # Assert
    assert response.status_code == 503
    assert response.json() == {
        "error": "standings_plan_unavailable",
        "detail": "standings provider plan does not cover the requested data",
    }
    assert calls == ["/leagues"]
    assert KEY not in response.text and "Free plan" not in response.text


@pytest.mark.parametrize("plan", [None, "", [], {}, 123])
def test_get_standings_malformed_plan_error_returns_sanitized_502(plan: object) -> None:
    # Arrange
    body = envelope([])
    body["errors"] = {"plan": plan}
    client, _ = make_client(failure=httpx.Response(200, json=body))
    # Act
    with client:
        response = client.get(URL, headers=AUTH)
    # Assert
    assert response.status_code == 502
    assert response.json()["error"] == "standings_error"


@pytest.mark.parametrize(
    "scenario",
    [
        "truncated_table",
        "duplicate_club",
        "wrong_season",
        "wrong_league",
        "missing_points",
        "bad_goals",
        "bad_positions",
        "incomplete_roster",
        "duplicate_fixture",
        "wrong_fixture_league",
        "missing_final_score",
        "unknown_status",
        "missing_history",
        "bad_source_totals",
        "cup_result",
        "wrong_metadata",
        "foreign_metadata",
        "no_current_season",
        "duplicate_season",
    ],
)
def test_get_standings_inconsistent_source_returns_502(scenario: str) -> None:
    # Arrange
    data, masters = source_data()
    table = data["/standings"][0]["league"]
    rows = table["standings"][0]
    fixtures = data["/fixtures"]
    final = next(match for match in fixtures if match["fixture"]["status"]["short"] == "FT")
    match scenario:
        case "truncated_table":
            rows.pop()
        case "duplicate_club":
            rows[-1] = deepcopy(rows[0])
        case "wrong_season":
            table["season"] = 2025
        case "wrong_league":
            table["id"] = 2
        case "missing_points":
            rows[0].pop("points")
        case "bad_goals":
            rows[0]["goalsDiff"] = True
        case "bad_positions":
            rows[0]["rank"] = 20
        case "incomplete_roster":
            data["/teams"].pop()
        case "duplicate_fixture":
            fixtures.append(deepcopy(final))
        case "wrong_fixture_league":
            final["league"]["id"] = 2
        case "missing_final_score":
            final["goals"]["home"] = None
        case "unknown_status":
            final["fixture"]["status"]["short"] = "unknown"
        case "missing_history":
            fixtures.remove(final)
        case "bad_source_totals":
            rows[0]["all"]["draw"] = 1
        case "cup_result":
            final["fixture"]["status"]["short"] = "AET"
        case "wrong_metadata":
            data["/leagues"][0]["league"]["id"] = 2
        case "foreign_metadata":
            data["/leagues"][0]["country"]["name"] = "England"
        case "no_current_season":
            data["/leagues"][0]["seasons"][0]["current"] = False
        case "duplicate_season":
            data["/leagues"][0]["seasons"] *= 2
    client, _ = make_client(data, masters)
    # Act
    with client:
        response = client.get(URL, headers=AUTH)
    # Assert
    assert response.status_code == 502
    assert response.json()["error"] == "standings_error"
    assert "rows" not in response.json()


@pytest.mark.parametrize(
    "scenario", ["missing", "ambiguous", "collision", "unknown_override", "duplicate_master"]
)
def test_get_standings_unresolved_club_identity_returns_502(scenario: str) -> None:
    # Arrange
    data, masters = source_data()
    overrides = {}
    if scenario == "missing":
        masters.pop(0)
    elif scenario == "ambiguous":
        masters[0]["name"] = "UD Club 1"
        masters.append({"id": 500, "name": "FC Club 1"})
    elif scenario == "collision":
        overrides = {1: 101, 2: 101}
    elif scenario == "unknown_override":
        overrides = {1: 999}
    else:
        masters.append(deepcopy(masters[0]))
    client, _ = make_client(data, masters, overrides=overrides)
    # Act
    with client:
        response = client.get(URL, headers=AUTH)
    # Assert
    assert response.status_code == 502


# ---- Edge cases ---- #


def test_get_standings_distinct_madrid_clubs_preserves_exact_identity() -> None:
    # Arrange
    data, masters = source_data()
    for index, name in enumerate(("Real Madrid", "Atletico Madrid")):
        data["/teams"][index]["team"]["name"] = name
        masters[index]["name"] = name
    client, _ = make_client(data, masters)
    # Act
    with client:
        response = client.get(URL, headers=AUTH)
    # Assert
    assert response.status_code == 200
    assert [row["team"]["id"] for row in response.json()["rows"][:2]] == [101, 102]


def test_get_standings_madrid_name_variants_preserves_distinct_identity() -> None:
    # Arrange
    data, masters = source_data()
    for index, (provider_name, fantasy_name) in enumerate(
        (("Real Madrid", "Real Madrid CF"), ("Atletico Madrid", "Atlético de Madrid"))
    ):
        data["/teams"][index]["team"]["name"] = provider_name
        masters[index]["name"] = fantasy_name
    client, _ = make_client(data, masters)
    # Act
    with client:
        response = client.get(URL, headers=AUTH)
    # Assert
    assert response.status_code == 200
    assert [row["team"]["id"] for row in response.json()["rows"][:2]] == [101, 102]


@pytest.mark.asyncio
async def test_get_standings_concurrent_cache_misses_share_one_complete_fetch() -> None:
    # Arrange
    client, calls = make_client()
    container = client.app.state.container
    try:
        # Act
        first, second = await asyncio.gather(
            container.standings_service.get_standings(1, None, "completed"),
            container.standings_service.get_standings(1, None, "completed"),
        )
        # Assert
        assert first.rows == second.rows and first.fetched_at == second.fetched_at
        assert len(calls) == 5
    finally:
        await container.aclose()


@pytest.mark.parametrize(
    "query, expected",
    [
        ("/competitions/2/standings?mode=completed", 404),
        (URL + "&season=2025", 404),
        (URL + "&season=1999", 422),
        ("/competitions/0/standings?mode=completed", 422),
        ("/competitions/1/standings?mode=garbage", 422),
        (URL + "&extra=value", 422),
        ("/competitions/1/standings", 503),
    ],
)
def test_get_standings_unsupported_resource_or_query_returns_documented_error(
    query: str, expected: int
) -> None:
    # Arrange
    client, calls = make_client()
    # Act
    with client:
        response = client.get(query, headers=AUTH)
    # Assert
    assert response.status_code == expected
    if expected == 503:
        assert response.json()["error"] == "standings_live_unavailable" and calls == []


def test_get_standings_preseason_returns_twenty_zero_game_rows() -> None:
    # Arrange
    data, masters = source_data()
    data["/fixtures"] = []
    for row in data["/standings"][0]["league"]["standings"][0]:
        row["points"] = row["goalsDiff"] = 0
        row["all"] = {
            "played": 0,
            "win": 0,
            "draw": 0,
            "lose": 0,
            "goals": {"for": 0, "against": 0},
        }
    client, _ = make_client(data, masters)
    # Act
    with client:
        response = client.get(URL, headers=AUTH)
    # Assert
    assert response.status_code == 200
    assert all(row["played"] == 0 and row["last5Matches"] == [] for row in response.json()["rows"])


@pytest.mark.asyncio
async def test_get_rows_paginated_source_fetches_every_page() -> None:
    # Arrange
    pages = []

    def handler(request: httpx.Request) -> httpx.Response:
        page = int(request.url.params.get("page", "1"))
        pages.append(page)
        return httpx.Response(200, json=envelope([{"id": page}], page=page, total=2))

    client = FootballClient(api_key=SecretStr(KEY), transport=httpx.MockTransport(handler))
    try:
        # Act
        rows = await client.get_rows("/fixtures", {"league": 140})
        # Assert
        assert rows == [{"id": 1}, {"id": 2}] and pages == [1, 2]
    finally:
        await client.aclose()


@pytest.mark.parametrize(
    "change",
    [
        "bad_page",
        "wrong_count",
        "error_envelope",
        "unbounded",
        "empty_intermediate",
        "changed_total",
    ],
)
@pytest.mark.asyncio
async def test_get_rows_invalid_pagination_returns_502(change: str) -> None:
    # Arrange
    def handler(request: httpx.Request) -> httpx.Response:
        page = int(request.url.params.get("page", "1"))
        body = envelope([{"id": page}], page=page, total=2)
        if change == "bad_page":
            body["paging"]["current"] = False
        elif change == "wrong_count":
            body["results"] = 9
        elif change == "error_envelope":
            body["errors"] = {"secret": KEY}
        elif change == "unbounded":
            body["paging"]["total"] = 1000
        elif change == "empty_intermediate":
            body = envelope([], total=2)
        elif page == 2:
            body["paging"]["total"] = 3
        return httpx.Response(200, json=body)

    client = FootballClient(api_key=SecretStr(KEY), transport=httpx.MockTransport(handler))
    try:
        # Act / Assert
        with pytest.raises(UpstreamError) as raised:
            await client.get_rows("/fixtures", {"league": 140})
        assert raised.value.status_code == 502 and KEY not in str(raised.value)
    finally:
        await client.aclose()


def test_settings_invalid_standings_bounds_reject_configuration() -> None:
    # Arrange / Act / Assert
    for fields in ({"standings_ttl_seconds": 1}, {"standings_club_ids": {1: 0}}):
        with pytest.raises(ValidationError):
            Settings(_env_file=None, **fields)
