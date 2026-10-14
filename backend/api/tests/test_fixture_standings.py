"""Fixture-derived standings with authenticated HTTP and source reconciliation."""

# ---- Mocks, fixtures & helpers ---- #

from copy import deepcopy

import httpx
import pytest
from fantasy_api.api.deps import build_container
from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.config import Settings
from fantasy_api.main import create_app
from fastapi.testclient import TestClient
from test_standings import AUTH, NOW, URL, Validator, source_data


def inputs():
    """Build synthetic official totals and the corresponding public calendar."""
    data, masters = source_data()
    masters[0]["badgeColor"] = "https://assets.example.test/club-101.png"
    official = {
        "season": 2026,
        "fetched_at": NOW.isoformat(),
        "rows": [
            {
                "team": row["team"],
                "position": row["rank"],
                "points": row["points"],
                "played": row["all"]["played"],
                "won": row["all"]["win"],
                "drawn": row["all"]["draw"],
                "lost": row["all"]["lose"],
                "goals_for": row["all"]["goals"]["for"],
                "goals_against": row["all"]["goals"]["against"],
                "goal_difference": row["goalsDiff"],
            }
            for row in data["/standings"][0]["league"]["standings"][0]
        ],
    }
    fixtures = [
        {
            "id": str(row["fixture"]["id"]),
            "localId": row["teams"]["home"]["id"] + 100,
            "visitorId": row["teams"]["away"]["id"] + 100,
            "matchState": 7 if row["fixture"]["status"]["short"] == "FT" else 10,
            "matchDate": row["fixture"]["date"],
            "localScore": row["goals"]["home"],
            "visitorScore": row["goals"]["away"],
        }
        for row in data["/fixtures"]
    ]
    return official, fixtures, masters


def client_for(official=None, fixtures=None, *, broken_week=False, directory=None):
    """Wire the full app using only private scraper and public calendar transports."""
    table, matches, masters = inputs()
    calls = []

    def fantasy(request):
        assert "Authorization" not in request.headers
        calls.append(str(request.url))
        if request.url.path == "/api/v3/teams-master":
            return httpx.Response(200, json=masters if directory is None else directory)
        assert request.url.path == "/api/v1/competition/1/calendar"
        week = int(request.url.params["weekNumber"])
        if broken_week and week == 38:
            return httpx.Response(200, text="not json")
        return httpx.Response(
            200, json=(matches if fixtures is None else fixtures) if week == 1 else []
        )

    def scraping(request):
        assert request.url.path == "/internal/scrape/standings"
        assert request.headers["X-Service-Token"] == "private-test-token"
        assert "Authorization" not in request.headers
        calls.append(str(request.url))
        return httpx.Response(200, json=table if official is None else official)

    def forbidden(request):
        raise AssertionError("No paid provider or private LaLiga credentials may be requested")

    settings = Settings(
        _env_file=None,
        debug=False,
        standings_source="laliga-fixtures",
        scraping_base_url="https://scraping.test",
        scraping_service_token="private-test-token",
    )
    container = build_container(
        settings,
        jwt_validator=Validator(),
        laliga_client=LaligaFantasyClient(
            origin="https://fantasy.test", transport=httpx.MockTransport(fantasy)
        ),
        scraping_transport=httpx.MockTransport(scraping),
        football_transport=httpx.MockTransport(forbidden),
    )
    return TestClient(create_app(settings, container)), calls


# ---- Happy path ---- #


def test_get_standings_completed_fixtures_returns_computed_totals_and_cached_table():
    client, calls = client_for()
    with client:
        first = client.get(URL, headers=AUTH)
        assert first.status_code == 200, first.text
        body = first.json()
        row = body["rows"][0]
        assert body["source"] == "laliga-fixtures"
        assert body["season"] == 2026
        assert len(body["rows"]) == 20
        assert (row["played"], row["won"], row["drawn"], row["lost"]) == (6, 6, 0, 0)
        assert (row["goalsFor"], row["goalsAgainst"], row["goalDifference"]) == (6, 0, 6)
        assert row["points"] == 16  # Authoritative adjustment, rather than 6 * 3.
        assert row["team"]["id"] == 101  # Source ids require identity mapping.
        assert row["team"]["badgeUrl"] == "https://assets.example.test/club-101.png"
        assert [m["matchId"] for m in row["last5Matches"]] == [
            f"laliga-fantasy:{i}" for i in range(2, 7)
        ]
        assert all(m["result"] == "W" for m in row["last5Matches"])
        assert body["rows"][1]["last5Matches"][0]["result"] == "L"
        assert body["rows"][7]["played"] == 0  # Postponed/in-progress games excluded.
        count = len(calls)
        second = client.get(URL, headers=AUTH)
        assert second.status_code == 200
        assert second.json()["cached"] is True
        assert second.json()["fetchedAt"] == body["fetchedAt"]
        assert len(calls) == count == 40
        weeks = {int(httpx.URL(url).params["weekNumber"]) for url in calls if "calendar" in url}
        assert weeks == set(range(1, 39))


def test_get_standings_rearranged_and_duplicate_match_uses_kickoff_once():
    table, fixtures, _ = inputs()
    fixture = next(row for row in fixtures if row["id"] == "1")
    fixture["matchDate"] = NOW.isoformat()
    fixtures.append(deepcopy(fixture))
    client, _ = client_for(table, fixtures)
    with client:
        response = client.get(URL, headers=AUTH)
        assert response.status_code == 200, response.text
        assert [m["matchId"] for m in response.json()["rows"][0]["last5Matches"]] == [
            "laliga-fantasy:3",
            "laliga-fantasy:4",
            "laliga-fantasy:5",
            "laliga-fantasy:6",
            "laliga-fantasy:1",
        ]


def test_get_standings_draw_fixture_computes_draw_for_both_clubs():
    table, fixtures, _ = inputs()
    match = next(row for row in fixtures if row["id"] == "1")
    match["visitorScore"] = 1
    for index in (0, 1):
        row = table["rows"][index]
        row["drawn"] = 1
        if index == 0:
            row.update(won=5, goals_against=1, goal_difference=5, points=14)
        else:
            row.update(lost=0, goals_for=1, goal_difference=0, points=1)
    client, _ = client_for(table, fixtures)
    with client:
        response = client.get(URL, headers=AUTH)
        assert response.status_code == 200, response.text
        assert response.json()["rows"][0]["drawn"] == 1
        assert response.json()["rows"][1]["last5Matches"][0]["result"] == "D"


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "case",
    [
        "missing_score",
        "missing_date",
        "wrong_season",
        "foreign_club",
        "self",
        "conflict",
        "incomplete",
    ],
)
def test_get_standings_invalid_fixtures_returns_sanitized_502(case):
    table, fixtures, _ = inputs()
    match = next(row for row in fixtures if row["id"] == "1")
    if case == "missing_score":
        match["localScore"] = None
    elif case == "missing_date":
        match["matchDate"] = None
    elif case == "wrong_season":
        match["matchDate"] = "2025-10-01T12:00:00Z"
    elif case == "foreign_club":
        match["visitorId"] = 999
    elif case == "self":
        match["visitorId"] = match["localId"]
    elif case == "conflict":
        conflict = deepcopy(match)
        conflict["localScore"] = 99
        fixtures.append(conflict)
    else:
        fixtures.remove(match)
    client, _ = client_for(table, fixtures)
    with client:
        response = client.get(URL, headers=AUTH)
        assert response.status_code == 502
        assert response.json()["error"] == "standings_error"
        assert "private-test-token" not in response.text


def test_get_standings_invalid_calendar_page_returns_502():
    client, _ = client_for(broken_week=True)
    with client:
        assert client.get(URL, headers=AUTH).status_code == 502


def test_get_standings_missing_jwt_returns_401_without_source_calls():
    client, calls = client_for()
    with client:
        assert client.get(URL).status_code == 401
        assert calls == []


# ---- Edge cases ---- #


def test_get_standings_unsupported_requests_returns_explicit_status():
    client, calls = client_for()
    with client:
        assert (
            client.get("/competitions/2/standings?mode=completed", headers=AUTH).status_code == 404
        )
        assert client.get("/competitions/1/standings?mode=live", headers=AUTH).status_code == 503
        assert calls == []
        assert client.get(URL + "&season=2025", headers=AUTH).status_code == 404


def test_get_standings_official_aliases_resolves_espanyol_and_osasuna():
    table, fixtures, masters = inputs()
    table["rows"][0]["team"]["name"] = "RCD Espanyol de Barcelona"
    table["rows"][1]["team"]["name"] = "CA Osasuna"
    masters[0]["name"] = "RCD Espanyol"
    masters[1]["name"] = "C.A. Osasuna"
    client, _ = client_for(table, fixtures, directory=masters)
    with client:
        response = client.get(URL, headers=AUTH)
        assert response.status_code == 200, response.text
        rows = response.json()["rows"]
        assert rows[0]["team"]["id"] == 101
        assert rows[0]["team"]["name"] == "RCD Espanyol"
        assert rows[1]["team"]["name"] == "C.A. Osasuna"
