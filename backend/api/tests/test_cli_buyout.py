# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json

import httpx
import pytest
from cli_http_stub import patch_httpx_client
from fantasy_api.cli import buyout as buyout_cli

# ---- Happy path ---- #


def test_main_with_jwt_prints_shield_summary(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    routes = {
        ("GET", "/buyout/leagues/42/player-teams/pt-9/shield"): {"isShielded": True},
    }
    patch_httpx_client(monkeypatch, routes)

    # Act
    code = buyout_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--league-id",
            "42",
            "--player-team-id",
            "pt-9",
        ],
    )

    # Assert
    assert code == 0
    assert "League 42 squad entry pt-9: shielded." in capsys.readouterr().out


def test_main_json_mode_returns_shield_bundle(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    routes = {
        ("GET", "/buyout/leagues/42/player-teams/pt-9/shield"): {"isShielded": True},
    }
    patch_httpx_client(monkeypatch, routes)

    # Act
    code = buyout_cli.main(
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

    # Assert
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["league_id"] == "42"
    assert payload["player_team_id"] == "pt-9"
    assert payload["shield"]["isShielded"] is True


# ---- Error paths ---- #


def test_main_missing_credentials_returns_1(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange / Act
    code = buyout_cli.main(["--league-id", "42", "--player-team-id", "pt-9"])

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
    code = buyout_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--league-id",
            "42",
            "--player-team-id",
            "pt-9",
        ],
    )

    # Assert
    assert code == 1
    err = capsys.readouterr().err
    assert "needs_reauth" in err
    assert "Traceback" not in err


# ---- Edge cases ---- #


def test_main_encodes_slash_ids_in_shield_path(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.raw_path.decode())
        return httpx.Response(200, json={"isShielded": False})

    patch_httpx_client(monkeypatch, handler)

    # Act
    code = buyout_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--league-id",
            "a/b",
            "--player-team-id",
            "p/t",
        ],
    )

    # Assert
    assert code == 0
    assert seen == ["/buyout/leagues/a%2Fb/player-teams/p%2Ft/shield"]
    assert "not shielded" in capsys.readouterr().out


def test_main_unknown_shield_shape_prints_status_unknown(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    routes = {
        ("GET", "/buyout/leagues/42/player-teams/pt-9/shield"): {"ok": True},
    }
    patch_httpx_client(monkeypatch, routes)

    # Act
    code = buyout_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--league-id",
            "42",
            "--player-team-id",
            "pt-9",
        ],
    )

    # Assert
    assert code == 0
    assert "status unknown" in capsys.readouterr().out
