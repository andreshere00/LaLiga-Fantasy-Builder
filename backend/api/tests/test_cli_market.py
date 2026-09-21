# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json

import httpx
import pytest
from cli_http_stub import patch_httpx_client
from fantasy_api.cli import market as market_cli

# ---- Happy path ---- #


def test_main_with_jwt_prints_league_summary(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    routes = {
        ("GET", "/leagues"): [{"id": "42", "name": "Liga Amigos"}],
        ("GET", "/market/leagues/42"): {"marketPlayers": [], "userBids": []},
        ("GET", "/market/leagues/42/history"): [{"id": "h1"}],
    }
    patch_httpx_client(monkeypatch, routes)

    code = market_cli.main(
        ["--jwt", "tok", "--api-base", "http://api.test"],
    )

    assert code == 0
    out = capsys.readouterr().out
    assert "League 42: market snapshot and history fetched." in out


def test_main_json_mode_returns_aggregated_payload(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    routes = {
        ("GET", "/leagues"): [{"id": "42", "name": "Liga"}],
        ("GET", "/market/leagues/42"): {"marketPlayers": [{"id": "m1"}]},
        ("GET", "/market/leagues/42/history"): [],
    }
    patch_httpx_client(monkeypatch, routes)

    code = market_cli.main(
        ["--jwt", "tok", "--api-base", "http://api.test", "--json"],
    )

    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["leagues"][0]["league_id"] == "42"
    assert payload["leagues"][0]["market"]["marketPlayers"][0]["id"] == "m1"
    assert payload["leagues"][0]["offers"] is None


def test_main_with_league_id_filters_leagues(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    routes = {
        ("GET", "/leagues"): [
            {"id": "1", "name": "A"},
            {"id": "42", "name": "B"},
        ],
        ("GET", "/market/leagues/42"): {},
        ("GET", "/market/leagues/42/history"): [],
    }
    patch_httpx_client(monkeypatch, routes)

    code = market_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--league-id",
            "42",
            "--json",
        ],
    )

    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert len(payload["leagues"]) == 1
    assert payload["leagues"][0]["league_id"] == "42"


def test_main_with_player_team_id_fetches_offers(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    routes = {
        ("GET", "/leagues"): [{"id": "42", "name": "Liga"}],
        ("GET", "/market/leagues/42"): {},
        ("GET", "/market/leagues/42/history"): [],
        ("GET", "/market/leagues/42/player-teams/pt-9/offers"): {
            "offers": [{"id": "o1"}],
        },
    }
    patch_httpx_client(monkeypatch, routes)

    code = market_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--league-id",
            "42",
            "--player-team-id",
            "pt-9",
            "--json",
        ],
    )

    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["leagues"][0]["player_team_id"] == "pt-9"
    assert payload["leagues"][0]["offers"]["offers"][0]["id"] == "o1"


# ---- Error paths ---- #


def test_main_missing_credentials_returns_1(
    capsys: pytest.CaptureFixture[str],
) -> None:
    code = market_cli.main([])

    assert code == 1
    assert "Missing credentials" in capsys.readouterr().err


def test_main_player_team_id_without_league_id_returns_1(
    capsys: pytest.CaptureFixture[str],
) -> None:
    code = market_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--player-team-id",
            "pt-9",
        ],
    )

    assert code == 1
    assert "requires --league-id" in capsys.readouterr().err


def test_main_unknown_league_id_returns_1(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    routes = {
        ("GET", "/leagues"): [{"id": "1", "name": "Other"}],
    }
    patch_httpx_client(monkeypatch, routes)

    code = market_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--league-id",
            "missing",
        ],
    )

    assert code == 1
    assert "not found" in capsys.readouterr().err


# ---- Edge cases ---- #


def test_main_encodes_slash_league_id_in_paths(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.raw_path.decode()
        seen.append(path)
        if path == "/leagues":
            return httpx.Response(200, json=[{"id": "a/b", "name": "Liga"}])
        if path == "/market/leagues/a%2Fb":
            return httpx.Response(200, json={})
        if path == "/market/leagues/a%2Fb/history":
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    patch_httpx_client(monkeypatch, handler)

    code = market_cli.main(
        ["--jwt", "tok", "--api-base", "http://api.test", "--json"],
    )

    assert code == 0
    assert "/market/leagues/a%2Fb" in seen
    assert "/market/leagues/a%2Fb/history" in seen
