# ---- Mocks, fixtures & helpers ---- #

import json
from copy import deepcopy
from pathlib import Path

import httpx
import pytest
from cli_http_stub import clear_cli_credential_env, patch_httpx_client
from fantasy_api.cli import standings as cli
from fantasy_api.cli.contracts import validate_response

PAYLOAD = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/standings-response.json").read_text()
)["payload"]


# ---- Happy path ---- #


@pytest.mark.parametrize("json_output", [True, False])
def test_main_standings_method_returns_complete_contract(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    json_output: bool,
) -> None:
    # Arrange
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET" and request.url.path == "/competitions/1/standings"
        assert request.url.params["mode"] == "completed" and request.url.params["season"] == "2026"
        assert request.headers["Authorization"] == "Bearer app-jwt"
        return httpx.Response(200, json=PAYLOAD)

    patch_httpx_client(monkeypatch, handler)
    args = ["--jwt", "app-jwt", "--api-base", "http://api.test", "--season", "2026"]
    # Act
    result = cli.main(args + (["--json"] if json_output else []))
    # Assert
    assert result == 0
    out = capsys.readouterr().out
    if json_output:
        assert json.loads(out)["rows"] == PAYLOAD["rows"]
    else:
        assert "Club 1" in out and "Last 5" in out and "hourly" not in out


# ---- Error paths ---- #


@pytest.mark.parametrize("payload", ["not JSON", {"rows": []}, {"private": "secret"}])
def test_main_invalid_success_returns_failure_without_payload_leak(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    payload: object,
) -> None:
    # Arrange
    patch_httpx_client(monkeypatch, {("GET", "/competitions/1/standings"): payload})
    # Act
    result = cli.main(["--jwt", "app-jwt"])
    # Assert
    assert result == 1 and "secret" not in capsys.readouterr().err


def test_main_missing_app_credentials_returns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    # Arrange
    clear_cli_credential_env(monkeypatch)
    # Act / Assert
    assert cli.main([]) == 1


@pytest.mark.parametrize(
    "change", ["totals", "form", "duplicate_club", "missing_time", "bad_result", "alias"]
)
def test_validate_response_malformed_shared_standings_rejects_contract(change: str) -> None:
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
        validate_response("/competitions/1/standings", payload)


# ---- Edge cases ---- #


@pytest.mark.parametrize(
    "args", [["--season", "1999"], ["--competition-id", "0"], ["--mode", "unknown"]]
)
def test_main_invalid_options_reject_before_fetch(args: list[str]) -> None:
    # Arrange / Act / Assert
    with pytest.raises(SystemExit):
        cli.main(args)
