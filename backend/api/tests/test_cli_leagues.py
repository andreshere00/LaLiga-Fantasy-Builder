# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json

import httpx
import pytest
from cli_http_stub import patch_httpx_client
from fantasy_api.cli import leagues as leagues_cli

# ---- Happy path ---- #


def test_main_with_jwt_prints_position(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    routes = {
        ("GET", "/leagues"): [
            {
                "id": "42",
                "name": "Liga Amigos",
                "week": 5,
                "team": {"id": "99", "name": "Mi Equipo", "points": 100},
            }
        ],
        ("GET", "/leagues/42/standing"): [
            {"position": 1, "teamId": "1", "name": "Otro", "points": 120},
            {"position": 2, "teamId": "99", "name": "Mi Equipo", "points": 100},
        ],
        ("GET", "/leagues/42/standing/5"): [
            {"position": 1, "teamId": "99", "name": "Mi Equipo", "points": 12},
        ],
        ("GET", "/leagues/42/activity/0"): [{"msg": "compra"}],
        ("GET", "/leagues/42/teams"): [{"id": "99", "name": "Mi Equipo"}],
        ("GET", "/leagues/42/teams/99"): {"id": "99", "players": []},
    }
    patch_httpx_client(monkeypatch, routes)

    # Act
    code = leagues_cli.main(
        ["--jwt", "tok", "--api-base", "http://api.test"],
    )

    # Assert
    assert code == 0
    out = capsys.readouterr().out
    assert "Liga Amigos" in out
    assert "Position: 2" in out
    assert "Week 5 standing" in out
    assert "← you" in out


def test_main_json_mode_returns_aggregated_payload(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    routes = {
        ("GET", "/leagues"): [{"id": 1, "name": "L", "team": {"id": 2}}],
        ("GET", "/leagues/1/standing"): [],
        ("GET", "/leagues/1/standing/3"): [],
        ("GET", "/leagues/1/activity/0"): [],
        ("GET", "/leagues/1/teams"): [],
        ("GET", "/leagues/1/teams/2"): {"id": 2},
    }
    patch_httpx_client(monkeypatch, routes)

    # Act
    code = leagues_cli.main(
        ["--jwt", "tok", "--api-base", "http://api.test", "--json", "--week", "3"],
    )

    # Assert
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["leagues"][0]["league_id"] == 1
    assert payload["leagues"][0]["week"] == 3


def test_exchange_token_then_fetch(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/auth/token":
            assert request.headers.get("X-CSRF-Token") == "csrf"
            return httpx.Response(200, json={"access_token": "jwt-1"})
        if request.url.path == "/leagues":
            assert request.headers["Authorization"] == "Bearer jwt-1"
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    patch_httpx_client(monkeypatch, handler)

    # Act
    code = leagues_cli.main(
        [
            "--session",
            "sess",
            "--csrf",
            "csrf",
            "--auth-base",
            "http://auth.test",
            "--api-base",
            "http://api.test",
        ],
    )

    # Assert
    assert code == 0
    assert "No leagues found." in capsys.readouterr().out


# ---- Error paths ---- #


def test_main_missing_credentials_returns_1(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange / Act
    code = leagues_cli.main([])

    # Assert
    assert code == 1
    assert "Missing credentials" in capsys.readouterr().err


def test_main_needs_reauth_returns_1(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            json={"error": "needs_reauth", "detail": "no_laliga_connection"},
        )

    patch_httpx_client(monkeypatch, handler)

    # Act
    code = leagues_cli.main(["--jwt", "tok", "--api-base", "http://api.test"])

    # Assert
    assert code == 1
    assert "needs_reauth" in capsys.readouterr().err


# ---- Edge cases ---- #


def test_infer_week_from_league_payload() -> None:
    # Arrange / Act / Assert
    assert leagues_cli._infer_week({"currentWeek": "7"}, {}) == 7
    assert leagues_cli._infer_week({}, {"week": 2}) == 2
    assert leagues_cli._infer_week({}, {}) is None


def test_find_position_matches_nested_team() -> None:
    # Arrange
    standing = [{"team": {"id": "9", "name": "X"}, "points": 3}]

    # Act
    found = leagues_cli._find_position(standing, "9")

    # Assert
    assert found is not None
    assert found["rank"] == 1
    assert found["points"] == 3


def test_print_teams_uses_nested_manager_name(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange / Act
    leagues_cli._print_teams(
        [
            {
                "id": "99",
                "name": "Mi Equipo",
                "manager": {"id": "m1", "managerName": "Ana"},
            }
        ]
    )

    # Assert
    out = capsys.readouterr().out
    assert "Ana" in out
    assert "managerName" not in out


def test_print_standing_uses_nested_manager_name(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange / Act
    leagues_cli._print_standing(
        [{"position": 1, "manager": {"managerName": "Luis"}, "points": 3}],
        highlight_team_id=None,
    )

    # Assert
    out = capsys.readouterr().out
    assert "Luis" in out
    assert "managerName" not in out
