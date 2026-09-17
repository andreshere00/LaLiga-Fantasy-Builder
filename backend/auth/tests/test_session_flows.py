# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import runpy

import httpx
import pytest
from fantasy_auth.cli import browser_session as cli
from fantasy_auth.cli.browser_session.errors import BrowserSessionError
from fantasy_auth.cli.browser_session.flows import (
    fetch_league_player,
    first_league_id,
    run_leagues_analysis,
    run_teams_analysis,
)


def _patch_session(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        cli,
        "login_with_playwright",
        lambda *_args, **_kwargs: ("sess", "csrf"),
    )
    monkeypatch.setattr(cli, "exchange_token", lambda **_kwargs: "jwt-token")
    monkeypatch.setattr(cli, "_connection_linked", lambda **_kwargs: True)


# ---- Happy path ---- #


def test_first_league_id_list_payload_returns_id() -> None:
    # Arrange / Act
    league_id = first_league_id([{"id": "42", "name": "Liga"}])

    # Assert
    assert league_id == "42"


def test_fetch_league_player_resolves_first_league() -> None:
    # Arrange
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        if request.url.path == "/leagues":
            return httpx.Response(200, json=[{"id": "42"}])
        return httpx.Response(200, json={"playerTeamId": "pt-1"})

    # Act
    data = fetch_league_player(
        api_base="http://api.test",
        jwt="jwt",
        player_id="7",
        league_id=None,
        transport=httpx.MockTransport(handler),
    )

    # Assert
    assert data == {"playerTeamId": "pt-1"}
    assert seen == ["/leagues", "/players/7/league/42"]


def test_main_linked_session_fetches_league_player(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    _patch_session(monkeypatch)
    monkeypatch.setattr(
        cli,
        "_fetch_league_player",
        lambda **_kwargs: {"playerTeamId": "pt-1"},
    )

    # Act
    code = cli.main(["--player-id", "7", "--json"])

    # Assert
    assert code == 0
    payload = capsys.readouterr().out
    assert "pt-1" in payload


def test_main_unlinked_pairs_via_playwright(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    linked = {"value": False}
    monkeypatch.setattr(
        cli,
        "login_with_playwright",
        lambda *_args, **_kwargs: ("sess", "csrf"),
    )
    monkeypatch.setattr(cli, "exchange_token", lambda **_kwargs: "jwt-token")
    monkeypatch.setattr(
        cli,
        "_connection_linked",
        lambda **_kwargs: linked["value"],
    )

    def pair(**_kwargs: object) -> dict[str, object]:
        linked["value"] = True
        return {"ok": True}

    monkeypatch.setattr(cli, "pair_laliga_with_playwright", pair)
    monkeypatch.setattr(
        cli,
        "_fetch_league_player",
        lambda **_kwargs: {"playerTeamId": "pt-1"},
    )

    # Act
    code = cli.main(["--player-id", "7", "--json"])

    # Assert
    assert code == 0
    assert "pt-1" in capsys.readouterr().out


def test_main_leagues_analysis_prints_bundle(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    _patch_session(monkeypatch)
    monkeypatch.setattr(
        cli,
        "_run_leagues_analysis",
        lambda **_kwargs: {"leagues": [{"league_id": "42"}]},
    )

    # Act
    code = cli.main(["leagues-analysis"])

    # Assert
    assert code == 0
    payload = capsys.readouterr().out
    assert "leagues_analysis" in payload
    assert "42" in payload


def test_main_teams_analysis_prints_bundle(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    _patch_session(monkeypatch)
    monkeypatch.setattr(
        cli,
        "_run_teams_analysis",
        lambda **_kwargs: {"teams": [{"team_id": "99"}]},
    )

    # Act
    code = cli.main(["teams-analysis", "--team-id", "99"])

    # Assert
    assert code == 0
    payload = capsys.readouterr().out
    assert "teams_analysis" in payload
    assert "99" in payload


def test_main_unlinked_leagues_analysis_pairs(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    linked = {"value": False}
    monkeypatch.setattr(
        cli,
        "login_with_playwright",
        lambda *_args, **_kwargs: ("sess", "csrf"),
    )
    monkeypatch.setattr(cli, "exchange_token", lambda **_kwargs: "jwt-token")
    monkeypatch.setattr(
        cli,
        "_connection_linked",
        lambda **_kwargs: linked["value"],
    )

    def pair(**_kwargs: object) -> dict[str, object]:
        linked["value"] = True
        return {"ok": True}

    monkeypatch.setattr(cli, "pair_laliga_with_playwright", pair)
    monkeypatch.setattr(
        cli,
        "_run_leagues_analysis",
        lambda **_kwargs: {"leagues": [{"league_id": "1"}]},
    )

    # Act
    code = cli.main(["leagues-analysis"])

    # Assert
    assert code == 0
    assert "leagues_analysis" in capsys.readouterr().out


def test_run_leagues_analysis_uses_api_transport() -> None:
    # Arrange
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        if request.url.path == "/leagues":
            return httpx.Response(
                200,
                json=[{"id": "42", "team": {"id": "9"}, "week": 1}],
            )
        return httpx.Response(200, json={"ok": True})

    # Act
    report = run_leagues_analysis(
        api_base="http://api.test",
        jwt="jwt",
        league_id=None,
        week=None,
        activity_page=0,
        team_id=None,
        transport=httpx.MockTransport(handler),
    )

    # Assert
    assert report["leagues"][0]["league_id"] == "42"
    assert "/leagues/42/standing" in seen
    assert "/leagues/42/standing/1" in seen
    assert "/leagues/42/activity/0" in seen
    assert "/leagues/42/teams" in seen
    assert "/leagues/42/teams/9" in seen


# ---- Error paths ---- #


def test_main_missing_put_lineup_fails_before_login(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    def boom(*_args: object, **_kwargs: object) -> tuple[str, str]:
        raise AssertionError("login should not run")

    monkeypatch.setattr(cli, "login_with_playwright", boom)

    # Act
    code = cli.main(
        ["teams-analysis", "--team-id", "99", "--put-lineup", "missing.json"],
    )

    # Assert
    assert code == 1


def test_main_placeholder_team_id_fails_before_login(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    def boom(*_args: object, **_kwargs: object) -> tuple[str, str]:
        raise AssertionError("login should not run")

    monkeypatch.setattr(cli, "login_with_playwright", boom)

    # Act
    code = cli.main(["teams-analysis", "--team-id", "YOUR_TEAM"])

    # Assert
    assert code == 1


def test_main_http_error_returns_1(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    monkeypatch.setattr(
        cli,
        "login_with_playwright",
        lambda *_args, **_kwargs: ("sess", "csrf"),
    )

    def boom(**_kwargs: object) -> str:
        raise httpx.ConnectError("down")

    monkeypatch.setattr(cli, "exchange_token", boom)

    # Act
    code = cli.main(["--json"])

    # Assert
    assert code == 1
    assert "HTTP error" in capsys.readouterr().err


def test_main_unlinked_with_no_pair_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(
        cli,
        "login_with_playwright",
        lambda *_args, **_kwargs: ("sess", "csrf"),
    )
    monkeypatch.setattr(cli, "exchange_token", lambda **_kwargs: "jwt-token")
    monkeypatch.setattr(cli, "_connection_linked", lambda **_kwargs: False)

    # Act
    code = cli.main(["--player-id", "7", "--no-pair"])

    # Assert
    assert code == 1


# ---- Edge cases ---- #


def test_first_league_id_empty_payload_returns_none() -> None:
    # Arrange / Act / Assert
    assert first_league_id([]) is None
    assert first_league_id("nope") is None
    assert first_league_id({"leagues": [{"league_id": "7"}]}) == "7"
    assert first_league_id(["skip", {"id": "1"}]) == "1"


def test_fetch_league_player_without_league_raises() -> None:
    # Arrange
    transport = httpx.MockTransport(lambda _r: httpx.Response(200, json=[]))

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="No league id"):
        fetch_league_player(
            api_base="http://api.test",
            jwt="jwt",
            player_id="7",
            league_id=None,
            transport=transport,
        )


def test_run_teams_analysis_uses_api_transport() -> None:
    # Arrange
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/leagues":
            return httpx.Response(200, json=[{"id": "1", "team": {"id": "9"}}])
        return httpx.Response(200, json={"ok": True})

    # Act
    report = run_teams_analysis(
        api_base="http://api.test",
        jwt="jwt",
        team_id="9",
        league_id=None,
        week=1,
        put_lineup=None,
        transport=httpx.MockTransport(handler),
    )

    # Assert
    assert report["teams"][0]["team_id"] == "9"


def test_main_exports_and_print_jwt(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    _patch_session(monkeypatch)

    # Act
    code = cli.main(["--json", "--exports", "--print-jwt"])

    # Assert
    assert code == 0
    captured = capsys.readouterr()
    assert "export INTERNAL_JWT=" in captured.err
    assert "access_token" in captured.out


def test_main_without_flow_prints_ready_message(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    _patch_session(monkeypatch)

    # Act
    code = cli.main([])

    # Assert
    assert code == 0
    assert "Session ready" in capsys.readouterr().err


def test_browser_session_main_module_exits_zero(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(cli, "main", lambda argv=None: 0)

    # Act / Assert
    with pytest.raises(SystemExit) as exc_info:
        runpy.run_module(
            "fantasy_auth.cli.browser_session.__main__",
            run_name="__main__",
        )
    assert exc_info.value.code == 0
