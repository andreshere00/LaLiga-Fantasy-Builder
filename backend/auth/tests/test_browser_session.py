# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from unittest.mock import MagicMock

import httpx
import pytest
from fantasy_auth.cli import browser_session as cli
from fantasy_auth.cli import helper as laliga_helper


def _token_handler(request: httpx.Request) -> httpx.Response:
    assert request.url.path == "/auth/token"
    assert request.headers.get("X-CSRF-Token") == "csrf"
    assert request.headers.get("Origin") == "http://localhost:8000"
    return httpx.Response(
        200,
        json={"access_token": "jwt-token", "token_type": "Bearer", "expires_in": 900},
    )


# ---- Happy path ---- #


def test_exchange_token_valid_session_returns_jwt() -> None:
    # Arrange
    transport = httpx.MockTransport(_token_handler)

    # Act
    token = cli.exchange_token(
        auth_base="http://auth.test",
        origin="http://localhost:8000",
        session="sess",
        csrf="csrf",
        transport=transport,
    )

    # Assert
    assert token == "jwt-token"


def test_first_league_id_list_payload_returns_id() -> None:
    # Arrange / Act
    league_id = cli._first_league_id([{"id": "42", "name": "Liga"}])

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
    data = cli._fetch_league_player(
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
    monkeypatch.setattr(
        cli,
        "login_with_playwright",
        lambda *_args, **_kwargs: ("sess", "csrf"),
    )
    monkeypatch.setattr(cli, "exchange_token", lambda **_kwargs: "jwt-token")
    monkeypatch.setattr(cli, "_connection_linked", lambda **_kwargs: True)
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
    monkeypatch.setattr(
        cli,
        "login_with_playwright",
        lambda *_args, **_kwargs: ("sess", "csrf"),
    )
    monkeypatch.setattr(cli, "exchange_token", lambda **_kwargs: "jwt-token")
    monkeypatch.setattr(cli, "_connection_linked", lambda **_kwargs: True)
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
    monkeypatch.setattr(
        cli,
        "login_with_playwright",
        lambda *_args, **_kwargs: ("sess", "csrf"),
    )
    monkeypatch.setattr(cli, "exchange_token", lambda **_kwargs: "jwt-token")
    monkeypatch.setattr(cli, "_connection_linked", lambda **_kwargs: True)
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
    report = cli._run_leagues_analysis(
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


def test_pair_laliga_with_playwright_completes_from_captured_callback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(
        cli,
        "_create_pairing",
        lambda **_kwargs: {
            "pairing_id": "pair-1",
            "secret": "sec-1",
            "nonce": "nonce-1",
            "expires_at": "1",
        },
    )
    fake_b2c = MagicMock()
    pkce = laliga_helper.PkceAuthorizeSession(
        authorize_url="https://login.example/authorize",
        verifier="verifier",
        state="state",
        nonce="nonce-1",
        redirect_uri="authredirect://com.lfp.laligafantasy",
        b2c=fake_b2c,
    )
    monkeypatch.setattr(laliga_helper, "start_pkce_session", lambda **_: pkce)
    monkeypatch.setattr(
        laliga_helper,
        "complete_pairing_from_callback",
        lambda **_kwargs: {"ok": True, "manager_id": "mgr-1"},
    )
    seen: list[str] = []

    def capture(url: str) -> str:
        seen.append(url)
        return "authredirect://com.lfp.laligafantasy/?code=abc&state=state"

    # Act
    result = cli.pair_laliga_with_playwright(
        auth_base="http://auth.test",
        origin="http://localhost:8000",
        session="sess",
        csrf="csrf",
        capture_fn=capture,
    )

    # Assert
    assert result == {"ok": True, "manager_id": "mgr-1"}
    assert seen == ["https://login.example/authorize"]


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


def test_exchange_token_unauthorized_raises() -> None:
    # Arrange
    transport = httpx.MockTransport(
        lambda _r: httpx.Response(
            401,
            json={"error": "unauthorized", "detail": "csrf failed"},
        ),
    )

    # Act / Assert
    with pytest.raises(cli.BrowserSessionError, match="csrf failed"):
        cli.exchange_token(
            auth_base="http://auth.test",
            origin="http://localhost:8000",
            session="sess",
            csrf="csrf",
            transport=transport,
        )


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


def test_pair_laliga_with_playwright_create_failed_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(cli, "_create_pairing", lambda **_kwargs: None)

    # Act / Assert
    with pytest.raises(cli.BrowserSessionError, match="Create pairing failed"):
        cli.pair_laliga_with_playwright(
            auth_base="http://auth.test",
            origin="http://localhost:8000",
            session="sess",
            csrf="csrf",
            capture_fn=lambda _url: "unused",
        )


# ---- Edge cases ---- #


def test_first_league_id_empty_payload_returns_none() -> None:
    # Arrange / Act / Assert
    assert cli._first_league_id([]) is None
    assert cli._first_league_id("nope") is None


def test_header_location_reads_case_insensitive_value() -> None:
    # Arrange / Act
    value = cli._header_location({"Location": "authredirect://app/?code=1"})

    # Assert
    assert value == "authredirect://app/?code=1"


def test_capture_authredirect_darwin_uses_macos_helper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(cli.sys, "platform", "darwin")
    callback = (
        "authredirect://com.lfp.laligafantasy/?state=s&code=" + ("x" * 120)
    )
    monkeypatch.setattr(
        cli.authredirect_macos,
        "capture_authredirect_macos",
        lambda *_args, **_kwargs: callback,
    )

    # Act
    result = cli.capture_authredirect(
        "https://login.example/authorize",
        redirect_uri="authredirect://com.lfp.laligafantasy",
    )

    # Assert
    assert result == callback


def test_capture_authredirect_handler_error_falls_back_to_playwright(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(cli.sys, "platform", "darwin")

    def boom(*_args: object, **_kwargs: object) -> str:
        raise cli.authredirect_macos.AuthredirectHandlerError("osacompile")

    monkeypatch.setattr(
        cli.authredirect_macos,
        "capture_authredirect_macos",
        boom,
    )
    monkeypatch.setattr(
        cli,
        "capture_authredirect_with_playwright",
        lambda *_args, **_kwargs: "authredirect://ok",
    )

    # Act
    result = cli.capture_authredirect(
        "https://login.example/authorize",
        redirect_uri="authredirect://com.lfp.laligafantasy",
    )

    # Assert
    assert result == "authredirect://ok"
