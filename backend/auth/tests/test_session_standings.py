# ---- Mocks, fixtures & helpers ---- #

import json
from copy import deepcopy
from pathlib import Path

import httpx
import pytest
from fantasy_auth.cli import browser_session as cli
from fantasy_auth.cli.browser_session.args import needs_laliga, parse_args
from fantasy_auth.cli.browser_session.contracts import response_adapter
from fantasy_auth.cli.browser_session.flows import run_standings_analysis

PAYLOAD = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/standings-response.json").read_text()
)["payload"]


# ---- Happy path ---- #


def test_run_standings_analysis_verified_app_identity_uses_read_only_api_method() -> None:
    # Arrange
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET" and request.url.path == "/competitions/1/standings"
        assert dict(request.url.params) == {"mode": "completed", "season": "2026"}
        assert request.headers["Authorization"] == "Bearer app-jwt"
        return httpx.Response(200, json=PAYLOAD)

    # Act
    report = run_standings_analysis(
        api_base="https://api.test",
        jwt="app-jwt",
        competition_id=1,
        season=2026,
        mode="completed",
        transport=httpx.MockTransport(handler),
    )
    # Assert
    assert report["rows"] == PAYLOAD["rows"]


def test_main_standings_flow_mints_jwt_without_laliga_probe_or_pairing(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    monkeypatch.setattr(cli, "login_with_playwright", lambda *_args, **_kwargs: ("session", "csrf"))
    monkeypatch.setattr(cli, "exchange_token", lambda **_kwargs: "app-jwt")

    def forbidden(**_kwargs: object) -> None:
        raise AssertionError("standings flow must not probe or pair LaLiga")

    monkeypatch.setattr(cli, "_connection_linked", forbidden)
    monkeypatch.setattr(cli, "pair_laliga_with_playwright", forbidden)
    monkeypatch.setattr(cli, "_run_standings_analysis", lambda **_kwargs: PAYLOAD)
    # Act
    result = cli.main(["standings-analysis", "--json"])
    # Assert
    assert result == 0 and json.loads(capsys.readouterr().out)["standings_analysis"] == PAYLOAD
    assert not needs_laliga(parse_args(["standings-analysis"]))


def test_main_standings_with_player_read_linked_account_skips_pairing(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    monkeypatch.setattr(cli, "login_with_playwright", lambda *_args, **_kwargs: ("session", "csrf"))
    monkeypatch.setattr(cli, "exchange_token", lambda **_kwargs: "app-jwt")
    monkeypatch.setattr(cli, "_connection_linked", lambda **_kwargs: True)
    monkeypatch.setattr(cli, "_run_standings_analysis", lambda **_kwargs: PAYLOAD)
    monkeypatch.setattr(cli, "_fetch_league_player", lambda **_kwargs: {"id": "1"})
    # Act
    result = cli.main(
        ["--no-pair", "--player-id", "1", "--league-id", "1", "standings-analysis", "--json"]
    )
    # Assert
    assert result == 0
    report = json.loads(capsys.readouterr().out)
    assert report["linked"] is True
    assert report["league_player"] == {"id": "1"}


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "change", ["totals", "form", "duplicate_club", "missing_time", "bad_result", "alias"]
)
def test_response_adapter_malformed_shared_standings_rejects_contract(change: str) -> None:
    # Arrange
    payload = deepcopy(PAYLOAD)
    if change == "totals":
        payload["rows"][0]["played"] += 1
    elif change == "form":
        payload["rows"][0]["last5Matches"].pop()
    elif change == "duplicate_club":
        payload["rows"][1]["team"] = payload["rows"][0]["team"]
    elif change == "missing_time":
        payload.pop("fetchedAt")
    elif change == "bad_result":
        payload["rows"][0]["last5Matches"][0]["result"] = "L"
    else:
        payload["fetched_at"] = payload["fetchedAt"]
    # Act / Assert
    with pytest.raises(ValueError):
        response_adapter("GET", "/competitions/1/standings").validate_python(payload)


# ---- Edge cases ---- #


@pytest.mark.parametrize(
    "args", [["--season", "2101"], ["--competition-id", "0"], ["--mode", "unknown"]]
)
def test_parse_args_invalid_standings_options_rejects_input(args: list[str]) -> None:
    # Arrange / Act / Assert
    with pytest.raises(SystemExit):
        parse_args(["standings-analysis", *args])
