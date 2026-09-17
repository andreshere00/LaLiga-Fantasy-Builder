# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from fantasy_api.cli import common as cli_common
from fantasy_api.cli import teams as teams_cli


def _handler_map(routes: dict[tuple[str, str], Any]):
    def handler(request: httpx.Request) -> httpx.Response:
        key = (request.method, request.url.path)
        if key not in routes:
            return httpx.Response(404, json={"error": f"missing {key}"})
        payload = routes[key]
        if callable(payload):
            response = payload(request)
            if not isinstance(response, httpx.Response):
                raise TypeError("route handler must return httpx.Response")
            return response
        return httpx.Response(200, json=payload)

    return handler


def _patch_client(
    monkeypatch: pytest.MonkeyPatch,
    routes: dict[tuple[str, str], Any],
) -> None:
    transport = httpx.MockTransport(_handler_map(routes))
    real_client = httpx.Client

    def client_factory(*args: Any, **kwargs: Any) -> httpx.Client:
        kwargs["transport"] = transport
        kwargs.pop("timeout", None)
        return real_client(*args, timeout=30.0, **kwargs)

    monkeypatch.setattr(cli_common.httpx, "Client", client_factory)


# ---- Happy path ---- #


def test_main_with_jwt_prints_money_and_lineup(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    routes = {
        ("GET", "/leagues"): [
            {
                "id": "42",
                "name": "Liga Amigos",
                "team": {"id": "99", "name": "Mi Equipo"},
            }
        ],
        ("GET", "/teams/99/money"): {
            "teamMoney": 1_500_000,
            "teamInvestment": 200_000,
        },
        ("GET", "/teams/99/lineup"): {
            "formation": {
                "tacticalFormation": [4, 3, 3],
                "goalkeeper": [{"playerTeamId": "pt-1"}],
                "defender": [{"playerTeamId": "pt-2"}],
                "midfield": [],
                "striker": [],
            }
        },
        ("GET", "/teams/99/lineup/week/5"): {
            "weekNumber": 5,
            "formation": {"tacticalFormation": [3, 5, 2]},
        },
    }
    _patch_client(monkeypatch, routes)

    # Act
    code = teams_cli.main(
        ["--jwt", "tok", "--api-base", "http://api.test", "--week", "5"],
    )

    # Assert
    assert code == 0
    out = capsys.readouterr().out
    assert "Liga Amigos" in out
    assert "teamMoney=1500000" in out
    assert "Formation: 4-3-3" in out
    assert "Week 5 lineup" in out
    assert "Formation: 3-5-2" in out


def test_main_with_explicit_team_id_skips_leagues(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/leagues":
            return httpx.Response(500, text="should not call leagues")
        if request.url.path == "/teams/77/money":
            return httpx.Response(200, json={"teamMoney": 10})
        if request.url.path == "/teams/77/lineup":
            return httpx.Response(200, json={})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.Client

    def client_factory(*args: Any, **kwargs: Any) -> httpx.Client:
        kwargs["transport"] = transport
        kwargs.pop("timeout", None)
        return real_client(*args, timeout=30.0, **kwargs)

    monkeypatch.setattr(cli_common.httpx, "Client", client_factory)

    # Act
    code = teams_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--team-id",
            "77",
        ],
    )

    # Assert
    assert code == 0
    assert "teamMoney=10" in capsys.readouterr().out


def test_main_json_mode_returns_aggregated_payload(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    routes = {
        ("GET", "/teams/2/money"): {"teamMoney": 1},
        ("GET", "/teams/2/lineup"): {"formation": {}},
        ("GET", "/teams/2/lineup/week/3"): {"weekNumber": 3},
    }
    _patch_client(monkeypatch, routes)

    # Act
    code = teams_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--team-id",
            "2",
            "--week",
            "3",
            "--json",
        ],
    )

    # Assert
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["teams"][0]["team_id"] == "2"
    assert payload["teams"][0]["week"] == 3
    assert payload["teams"][0]["money"]["teamMoney"] == 1


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
            return httpx.Response(
                200,
                json=[{"id": "1", "name": "L", "team": {"id": "9"}}],
            )
        if request.url.path == "/teams/9/money":
            return httpx.Response(200, json={})
        if request.url.path == "/teams/9/lineup":
            return httpx.Response(200, json={})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.Client

    def client_factory(*args: Any, **kwargs: Any) -> httpx.Client:
        kwargs["transport"] = transport
        kwargs.pop("timeout", None)
        return real_client(*args, timeout=30.0, **kwargs)

    monkeypatch.setattr(cli_common.httpx, "Client", client_factory)

    # Act
    code = teams_cli.main(
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
    assert "Team id: 9" in capsys.readouterr().out


# ---- Error paths ---- #


def test_main_missing_credentials_returns_1(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange / Act
    code = teams_cli.main([])

    # Assert
    assert code == 1
    assert "Missing credentials" in capsys.readouterr().err


def test_main_needs_reauth_returns_1(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            json={"error": "needs_reauth", "detail": "no_laliga_connection"},
        )

    transport = httpx.MockTransport(handler)
    real_client = httpx.Client

    def client_factory(*args: Any, **kwargs: Any) -> httpx.Client:
        kwargs["transport"] = transport
        kwargs.pop("timeout", None)
        return real_client(*args, timeout=30.0, **kwargs)

    monkeypatch.setattr(cli_common.httpx, "Client", client_factory)

    # Act
    code = teams_cli.main(
        ["--jwt", "tok", "--api-base", "http://api.test", "--team-id", "1"],
    )

    # Assert
    assert code == 1
    assert "needs_reauth" in capsys.readouterr().err


def test_main_league_filter_not_found_returns_1(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    routes = {("GET", "/leagues"): [{"id": "42", "team": {"id": "99"}}]}
    _patch_client(monkeypatch, routes)

    # Act
    code = teams_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--league-id",
            "999",
        ],
    )

    # Assert
    assert code == 1
    assert "not found" in capsys.readouterr().err


# ---- Edge cases ---- #


def test_main_rejects_non_positive_week(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange / Act / Assert
    with pytest.raises(SystemExit) as exc_info:
        teams_cli.main(
            ["--jwt", "tok", "--api-base", "http://api.test", "--week", "0"],
        )
    assert exc_info.value.code == 2
    assert "week must be >= 1" in capsys.readouterr().err


def test_main_encodes_team_id_in_api_paths(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    seen_paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        raw_path = request.url.raw_path.decode()
        seen_paths.append(raw_path)
        if raw_path == "/teams/a%2Fb/money":
            return httpx.Response(200, json={"teamMoney": 1})
        if raw_path == "/teams/a%2Fb/lineup":
            return httpx.Response(200, json={})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_client = httpx.Client

    def client_factory(*args: Any, **kwargs: Any) -> httpx.Client:
        kwargs["transport"] = transport
        kwargs.pop("timeout", None)
        return real_client(*args, timeout=30.0, **kwargs)

    monkeypatch.setattr(cli_common.httpx, "Client", client_factory)

    # Act
    code = teams_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--team-id",
            "a/b",
        ],
    )

    # Assert
    assert code == 0
    assert seen_paths == ["/teams/a%2Fb/money", "/teams/a%2Fb/lineup"]
    assert "teamMoney=1" in capsys.readouterr().out


def test_safe_json_returns_empty_dict_for_invalid_json() -> None:
    # Arrange
    response = httpx.Response(401, text="not-json")

    # Act
    data = cli_common.safe_json(response)

    # Assert
    assert data == {}


def test_safe_json_returns_empty_dict_for_non_object_json() -> None:
    # Arrange
    response = httpx.Response(401, json=["not", "a", "dict"])

    # Act
    data = cli_common.safe_json(response)

    # Assert
    assert data == {}


def test_print_lineup_summarizes_player_nicknames(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange / Act
    teams_cli._print_lineup(
        {
            "formation": {
                "tacticalFormation": [4, 4, 2],
                "striker": [
                    {"playerMaster": {"nickname": "Bellingham"}},
                ],
            }
        }
    )

    # Assert
    out = capsys.readouterr().out
    assert "4-4-2" in out
    assert "Bellingham" in out


def test_print_money_empty_payload(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange / Act
    teams_cli._print_money({})

    # Assert
    assert "empty" in capsys.readouterr().out
