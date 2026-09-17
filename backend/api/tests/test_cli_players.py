# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import httpx
import pytest
from cli_http_stub import patch_httpx_client
from fantasy_api.cli import players as players_cli

# ---- Happy path ---- #


def test_main_without_jwt_prints_catalog_summary(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    routes = {
        ("GET", "/players"): [
            {"id": "1", "nickname": "Lamine"},
            {"id": "2", "nickname": "Pedri"},
        ],
    }
    patch_httpx_client(monkeypatch, routes)

    # Act
    code = players_cli.main(["--api-base", "http://api.test"])

    # Assert
    assert code == 0
    out = capsys.readouterr().out
    assert "Players: 2" in out
    assert "Lamine" in out


def test_main_with_player_id_fetches_market_value(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    routes = {
        ("GET", "/players"): [{"id": "7"}],
        ("GET", "/players/7/market-value"): [
            {"date": "2026-09-01", "marketValue": 100}
        ],
    }
    patch_httpx_client(monkeypatch, routes)

    # Act
    code = players_cli.main(
        ["--api-base", "http://api.test", "--player-id", "7", "--json"],
    )

    # Assert
    assert code == 0
    out = capsys.readouterr().out
    assert "marketValue" in out


def test_main_with_league_card_uses_jwt(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    seen: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/players":
            return httpx.Response(200, json=[{"id": "7"}])
        if request.url.path == "/players/7/market-value":
            return httpx.Response(200, json=[])
        if request.url.path == "/players/7/league/42":
            seen.append(request.headers.get("Authorization"))
            return httpx.Response(200, json={"playerTeamId": "pt-1"})
        return httpx.Response(404)

    patch_httpx_client(monkeypatch, handler)

    # Act
    code = players_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--player-id",
            "7",
            "--league-id",
            "42",
        ],
    )

    # Assert
    assert code == 0
    assert seen == ["Bearer tok"]
    assert "pt-1" in capsys.readouterr().out


# ---- Error paths ---- #


def test_main_league_card_without_credentials_fails(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    monkeypatch.delenv("INTERNAL_JWT", raising=False)
    routes = {("GET", "/players"): [{"id": "7"}]}
    patch_httpx_client(monkeypatch, routes)

    # Act
    code = players_cli.main(
        [
            "--api-base",
            "http://api.test",
            "--player-id",
            "7",
            "--league-id",
            "42",
        ],
    )

    # Assert
    assert code == 1


# ---- Edge cases ---- #


def test_main_encodes_player_id(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.raw_path.decode())
        if request.url.path == "/players":
            return httpx.Response(200, json=[])
        return httpx.Response(200, json=[])

    patch_httpx_client(monkeypatch, handler)

    # Act
    code = players_cli.main(
        ["--api-base", "http://api.test", "--player-id", "a/b"],
    )

    # Assert
    assert code == 0
    assert "/players/a%2Fb/market-value" in seen
