# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from fantasy_api.cli import players as players_cli


def _handler_map(routes: dict[tuple[str, str], Any]):
    def handler(request: httpx.Request) -> httpx.Response:
        key = (request.method, request.url.path)
        if key not in routes:
            return httpx.Response(404, json={"error": f"missing {key}"})
        payload = routes[key]
        if callable(payload):
            return payload(request)
        return httpx.Response(200, json=payload)

    return handler


def _patch_client(monkeypatch: pytest.MonkeyPatch, transport: httpx.MockTransport) -> None:
    real_client = httpx.Client

    def client_factory(*args: Any, **kwargs: Any) -> httpx.Client:
        kwargs["transport"] = transport
        kwargs.pop("timeout", None)
        return real_client(*args, timeout=30.0, **kwargs)

    monkeypatch.setattr(players_cli.httpx, "Client", client_factory)


# ---- Happy path ---- #


def test_main_catalog_prints_status_and_top_value(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    routes = {
        ("GET", "/players"): [
            {
                "id": "2",
                "nickname": "Cheap",
                "positionId": "4",
                "playerStatus": "ok",
                "marketValue": "100",
                "points": 1,
            },
            {
                "id": "1",
                "nickname": "Star",
                "positionId": "1",
                "playerStatus": "injured",
                "marketValue": "5000",
                "points": 10,
            },
        ]
    }
    _patch_client(monkeypatch, httpx.MockTransport(_handler_map(routes)))

    # Act
    code = players_cli.main(["--api-base", "http://api.test"])

    # Assert
    assert code == 0
    out = capsys.readouterr().out
    assert "Catalog: 2 players" in out
    assert "injured=1" in out
    assert "ok=1" in out
    assert "Star" in out
    assert out.find("Star") < out.find("Cheap")


def test_main_player_id_fetches_market_value(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    routes = {
        ("GET", "/players"): [
            {
                "id": "68",
                "nickname": "Unai Simón",
                "positionId": "1",
                "playerStatus": "ok",
                "marketValue": "49703931",
                "points": 38,
                "averagePoints": 7.6,
                "teamId": "3",
                "weekPoints": [{"weekNumber": 1, "points": 10}],
            }
        ],
        ("GET", "/player/68/market-value"): [
            {
                "lfpId": 3000068,
                "marketValue": 20000000,
                "date": "2026-06-29T00:00:00+02:00",
                "bids": 0,
            },
            {
                "lfpId": 3000068,
                "marketValue": 49703368,
                "date": "2026-09-16T00:00:00+02:00",
                "bids": 0,
            },
        ],
    }
    _patch_client(monkeypatch, httpx.MockTransport(_handler_map(routes)))

    # Act
    code = players_cli.main(
        ["--api-base", "http://api.test", "--player-id", "68"],
    )

    # Assert
    assert code == 0
    out = capsys.readouterr().out
    assert "Unai Simón" in out
    assert "GK(1)" in out
    assert "J1=10" in out
    assert "market-value: 2 points" in out
    assert "49,703,368" in out


def test_main_json_includes_league_card(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    def league_handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer tok"
        return httpx.Response(
            200,
            json={"id": "68", "playerTeamId": "pt-9", "buyoutClause": 10},
        )

    routes = {
        ("GET", "/players"): [{"id": "68", "nickname": "Unai Simón"}],
        ("GET", "/player/68/market-value"): [],
        ("GET", "/player/68/league/42"): league_handler,
    }
    _patch_client(monkeypatch, httpx.MockTransport(_handler_map(routes)))

    # Act
    code = players_cli.main(
        [
            "--api-base",
            "http://api.test",
            "--player-id",
            "68",
            "--league-id",
            "42",
            "--jwt",
            "tok",
            "--json",
        ],
    )

    # Assert
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["player_id"] == "68"
    assert payload["league_card"]["playerTeamId"] == "pt-9"


def test_exchange_token_then_fetch_league_card(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/auth/token":
            assert request.headers.get("X-CSRF-Token") == "csrf"
            return httpx.Response(200, json={"access_token": "jwt-1"})
        if request.url.path == "/player/68/league/42":
            assert request.headers["Authorization"] == "Bearer jwt-1"
            return httpx.Response(200, json={"playerTeamId": "pt-1"})
        if request.url.path == "/players":
            return httpx.Response(200, json=[{"id": "68", "nickname": "X"}])
        if request.url.path == "/player/68/market-value":
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    _patch_client(monkeypatch, httpx.MockTransport(handler))

    # Act
    code = players_cli.main(
        [
            "--session",
            "sess",
            "--csrf",
            "csrf",
            "--auth-base",
            "http://auth.test",
            "--api-base",
            "http://api.test",
            "--player-id",
            "68",
            "--league-id",
            "42",
        ],
    )

    # Assert
    assert code == 0
    assert "playerTeamId=pt-1" in capsys.readouterr().out


# ---- Error paths ---- #


def test_main_league_id_without_credentials_returns_1(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange / Act
    code = players_cli.main(
        ["--player-id", "68", "--league-id", "42", "--api-base", "http://api.test"],
    )

    # Assert
    assert code == 1
    assert "League card requires credentials" in capsys.readouterr().err


def test_main_league_id_without_player_id_returns_1(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange / Act
    code = players_cli.main(
        ["--league-id", "42", "--jwt", "tok", "--api-base", "http://api.test"],
    )

    # Assert
    assert code == 1
    assert "--league-id requires --player-id" in capsys.readouterr().err


def test_main_needs_reauth_returns_1(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/players":
            return httpx.Response(200, json=[{"id": "68"}])
        if request.url.path == "/player/68/market-value":
            return httpx.Response(200, json=[])
        return httpx.Response(
            401,
            json={"error": "needs_reauth", "detail": "no_laliga_connection"},
        )

    _patch_client(monkeypatch, httpx.MockTransport(handler))

    # Act
    code = players_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--player-id",
            "68",
            "--league-id",
            "42",
        ],
    )

    # Assert
    assert code == 1
    assert "needs_reauth" in capsys.readouterr().err


# ---- Edge cases ---- #


def test_main_player_missing_from_catalog_still_fetches_history(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    routes = {
        ("GET", "/players"): [],
        ("GET", "/player/68/market-value"): [
            {"marketValue": 1, "date": "2026-01-01T00:00:00Z"},
        ],
    }
    _patch_client(monkeypatch, httpx.MockTransport(_handler_map(routes)))

    # Act
    code = players_cli.main(
        ["--api-base", "http://api.test", "--player-id", "68"],
    )

    # Assert
    assert code == 0
    out = capsys.readouterr().out
    assert "not in catalog" in out
    assert "market-value: 1 points" in out


def test_format_money_and_position_helpers() -> None:
    # Arrange / Act / Assert
    assert players_cli._format_money("49703931") == "49,703,931"
    assert players_cli._format_money(None) == "—"
    assert players_cli._position_label("3") == "MID(3)"
    assert players_cli._position_label(None) == "?"
