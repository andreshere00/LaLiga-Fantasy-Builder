# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from typing import Any

import pytest
from fantasy_auth.cli.browser_session.errors import BrowserSessionError
from fantasy_auth.cli.session_analysis import (
    fetch_leagues_analysis,
    fetch_buyout_analysis,
    fetch_market_analysis,
    fetch_teams_analysis,
    infer_week,
)


def _recorder(payloads: dict[str, Any]) -> tuple[list[str], Any]:
    seen: list[str] = []

    def get_json(path: str) -> Any:
        seen.append(path)
        if path in payloads:
            return payloads[path]
        return {"ok": path}

    return seen, get_json


# ---- Happy path ---- #


def test_fetch_leagues_analysis_default_league_hits_catalog_routes() -> None:
    # Arrange
    payloads = {
        "/leagues": [
            {
                "id": "42",
                "name": "Liga",
                "currentWeek": 5,
                "team": {"id": "99"},
            }
        ],
    }
    seen, get_json = _recorder(payloads)

    # Act
    report = fetch_leagues_analysis(
        get_json=get_json,
        league_filter=None,
        week=None,
        activity_page=0,
    )

    # Assert
    assert seen == [
        "/leagues",
        "/leagues/42/standing",
        "/leagues/42/standing/5",
        "/leagues/42/activity/0",
        "/leagues/42/teams",
        "/leagues/42/teams/99",
    ]
    assert report["leagues"][0]["week"] == 5
    assert report["leagues"][0]["team_id"] == "99"


def test_fetch_teams_analysis_resolved_team_hits_money_and_lineup() -> None:
    # Arrange
    payloads = {
        "/leagues": [
            {
                "id": "42",
                "name": "Liga",
                "week": 3,
                "team": {"id": "99"},
            }
        ],
    }
    seen, get_json = _recorder(payloads)

    # Act
    report = fetch_teams_analysis(
        get_json=get_json,
        team_id=None,
        league_filter=None,
        week=None,
    )

    # Assert
    assert seen == [
        "/leagues",
        "/teams/99/money",
        "/teams/99/lineup",
        "/teams/99/lineup/week/3",
    ]
    assert report["teams"][0]["week"] == 3
    assert report["teams"][0]["put_lineup"] is None


def test_fetch_market_analysis_hits_market_routes() -> None:
    payloads = {
        "/leagues": [{"id": "42", "name": "Liga"}],
    }
    seen, get_json = _recorder(payloads)

    report = fetch_market_analysis(
        get_json=get_json,
        league_filter="42",
        player_team_id="pt-1",
    )

    assert seen == [
        "/leagues",
        "/market/leagues/42",
        "/market/leagues/42/history",
        "/market/leagues/42/player-teams/pt-1/offers",
    ]
    assert report["leagues"][0]["league_id"] == "42"
    assert report["leagues"][0]["offers"] == {"ok": seen[-1]}


def test_fetch_market_analysis_without_offers_skips_offers_route() -> None:
    payloads = {"/leagues": [{"id": "42", "name": "Liga"}]}
    seen, get_json = _recorder(payloads)

    report = fetch_market_analysis(
        get_json=get_json,
        league_filter=None,
        player_team_id=None,
    )

    assert seen == [
        "/leagues",
        "/market/leagues/42",
        "/market/leagues/42/history",
    ]
    assert report["leagues"][0]["offers"] is None


def test_fetch_market_analysis_missing_league_raises() -> None:
    _, get_json = _recorder({"/leagues": [{"id": "1"}]})

    with pytest.raises(BrowserSessionError, match="not found"):
        fetch_market_analysis(
            get_json=get_json,
            league_filter="missing",
            player_team_id=None,
        )


def test_fetch_market_analysis_player_team_without_league_raises() -> None:
    _, get_json = _recorder({"/leagues": [{"id": "1"}]})

    with pytest.raises(BrowserSessionError, match="requires --league-id"):
        fetch_market_analysis(
            get_json=get_json,
            league_filter=None,
            player_team_id="pt-1",
        )


def test_fetch_buyout_analysis_hits_shield_route() -> None:
    seen, get_json = _recorder({})

    report = fetch_buyout_analysis(
        get_json=get_json,
        league_id="42",
        player_team_id="pt-1",
    )

    assert seen == ["/buyout/leagues/42/player-teams/pt-1/shield"]
    assert report["league_id"] == "42"
    assert report["player_team_id"] == "pt-1"
    assert report["shield"] == {"ok": seen[0]}


def test_fetch_buyout_analysis_encodes_slash_ids() -> None:
    seen, get_json = _recorder({})

    fetch_buyout_analysis(
        get_json=get_json,
        league_id="a/b",
        player_team_id="p/t",
    )

    assert seen == ["/buyout/leagues/a%2Fb/player-teams/p%2Ft/shield"]


def test_fetch_buyout_analysis_missing_league_raises() -> None:
    _, get_json = _recorder({})

    with pytest.raises(BrowserSessionError, match="league-id"):
        fetch_buyout_analysis(
            get_json=get_json,
            league_id="",
            player_team_id="pt-1",
        )


def test_fetch_market_analysis_encodes_slash_ids() -> None:
    payloads = {"/leagues": [{"id": "a/b", "name": "Liga"}]}
    seen, get_json = _recorder(payloads)

    fetch_market_analysis(
        get_json=get_json,
        league_filter="a/b",
        player_team_id="p/t",
    )

    assert "/market/leagues/a%2Fb" in seen
    assert "/market/leagues/a%2Fb/history" in seen
    assert "/market/leagues/a%2Fb/player-teams/p%2Ft/offers" in seen


def test_fetch_teams_analysis_put_lineup_with_team_id_posts_body() -> None:
    # Arrange
    payloads = {"/leagues": []}
    seen, get_json = _recorder(payloads)
    puts: list[tuple[str, dict[str, Any]]] = []

    def put_json(path: str, body: dict[str, Any]) -> dict[str, Any]:
        puts.append((path, body))
        return {"saved": True}

    # Act
    report = fetch_teams_analysis(
        get_json=get_json,
        put_json=put_json,
        team_id="99",
        league_filter=None,
        week=2,
        put_lineup_body={"goalkeeper": 1},
    )

    # Assert
    assert puts == [("/teams/99/lineup", {"goalkeeper": 1})]
    assert report["teams"][0]["put_lineup"] == {"saved": True}
    assert "/teams/99/lineup/week/2" in seen


def test_fetch_leagues_analysis_skips_items_without_id() -> None:
    # Arrange
    payloads = {
        "/leagues": [
            {"name": "no-id"},
            {"id": "42", "team": {"id": "9"}},
        ]
    }
    seen, get_json = _recorder(payloads)

    # Act
    report = fetch_leagues_analysis(
        get_json=get_json,
        league_filter=None,
        week=1,
        activity_page=0,
    )

    # Assert
    assert [item["league_id"] for item in report["leagues"]] == ["42"]
    assert "/leagues/42/standing" in seen


def test_fetch_leagues_analysis_nested_leagues_payload() -> None:
    # Arrange
    payloads = {"/leagues": {"leagues": [{"id": "7", "teamId": "3"}]}}
    seen, get_json = _recorder(payloads)

    # Act
    report = fetch_leagues_analysis(
        get_json=get_json,
        league_filter=None,
        week=1,
        activity_page=0,
    )

    # Assert
    assert report["leagues"][0]["team_id"] == "3"
    assert "/leagues/7/teams/3" in seen


# ---- Error paths ---- #


def test_fetch_leagues_analysis_missing_league_raises() -> None:
    # Arrange
    _, get_json = _recorder({"/leagues": [{"id": "1"}]})

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="not found"):
        fetch_leagues_analysis(
            get_json=get_json,
            league_filter="missing",
            week=None,
            activity_page=0,
        )


def test_fetch_teams_analysis_put_without_team_id_raises() -> None:
    # Arrange
    _, get_json = _recorder({"/leagues": [{"id": "1", "team": {"id": "9"}}]})

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="requires --team-id"):
        fetch_teams_analysis(
            get_json=get_json,
            team_id=None,
            league_filter=None,
            week=None,
            put_json=lambda _p, _b: {},
            put_lineup_body={"goalkeeper": 1},
        )


def test_fetch_teams_analysis_put_without_client_raises() -> None:
    # Arrange
    _, get_json = _recorder({"/leagues": []})

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="not configured"):
        fetch_teams_analysis(
            get_json=get_json,
            team_id="99",
            league_filter=None,
            week=None,
            put_lineup_body={"goalkeeper": 1},
        )


def test_fetch_teams_analysis_league_filter_not_found_raises() -> None:
    # Arrange
    _, get_json = _recorder({"/leagues": [{"id": "1", "team": {"id": "9"}}]})

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="not found"):
        fetch_teams_analysis(
            get_json=get_json,
            team_id=None,
            league_filter="missing",
            week=None,
        )


def test_fetch_teams_analysis_without_embedded_team_raises() -> None:
    # Arrange
    _, get_json = _recorder({"/leagues": [{"id": "1"}]})

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="No team id found"):
        fetch_teams_analysis(
            get_json=get_json,
            team_id=None,
            league_filter=None,
            week=None,
        )


# ---- Edge cases ---- #


def test_infer_week_numeric_string_returns_int() -> None:
    # Arrange / Act
    week = infer_week({"jornada": "7"}, None)

    # Assert
    assert week == 7


def test_infer_week_ignores_non_dict_standing() -> None:
    # Arrange / Act / Assert
    assert infer_week({"week": 2}, "not-a-dict") == 2


def test_fetch_leagues_analysis_scalar_payload_returns_empty() -> None:
    # Arrange
    _, get_json = _recorder({"/leagues": "nope"})

    # Act
    report = fetch_leagues_analysis(
        get_json=get_json,
        league_filter=None,
        week=None,
        activity_page=0,
    )

    # Assert
    assert report == {"leagues": []}


def test_fetch_leagues_analysis_encodes_slash_ids() -> None:
    # Arrange
    payloads = {"/leagues": [{"id": "a/b", "team": {"id": "c/d"}}]}
    seen, get_json = _recorder(payloads)

    # Act
    fetch_leagues_analysis(
        get_json=get_json,
        league_filter=None,
        week=1,
        activity_page=2,
        team_id=None,
    )

    # Assert
    assert "/leagues/a%2Fb/standing" in seen
    assert "/leagues/a%2Fb/teams/c%2Fd" in seen
    assert "/leagues/a%2Fb/activity/2" in seen
