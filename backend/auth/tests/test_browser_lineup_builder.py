"""Independent read-only browser-session builder contract and preflight tests."""

# ---- Mocks, fixtures & helpers ---- #

import json
from pathlib import Path

import httpx
import pytest
from fantasy_auth.cli.browser_session.args import (
    load_builder_preferences,
    parse_args,
    validate_analysis_args,
)
from fantasy_auth.cli.browser_session.errors import BrowserSessionError
from fantasy_auth.cli.browser_session.http import FantasyClient
from fantasy_auth.cli.browser_session.lineup_builder_contracts import BuildResponse

ROOT = Path(__file__).resolve().parents[3]


# ---- Happy path ---- #


def test_build_json_mock_post_has_validated_read_only_path() -> None:
    payload = json.loads((ROOT / "contracts/lineup-builder-response.json").read_text())["payload"]
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        """No production provider requests are permitted by this test."""
        calls.append(request)
        assert request.method == "POST"
        assert request.url.path == "/lineup-builder/leagues/l1/build"
        assert request.headers["Authorization"] == "Bearer jwt"
        assert request.extensions["timeout"]["read"] >= 130
        return httpx.Response(200, json=payload)

    api = FantasyClient("http://api.test", "jwt", transport=httpx.MockTransport(handler))
    result = api.build_json("/lineup-builder/leagues/l1/build", {})
    assert BuildResponse.model_validate(result).team_id == "t1"
    assert len(calls) == 1


def test_parse_args_builder_flow_loads_preferences_before_login(tmp_path) -> None:
    file = tmp_path / "preferences.json"
    file.write_text('{"sources":["owned"]}')
    args = parse_args(
        ["lineup-builder-analysis", "--league-id", "l1", "--preferences-file", str(file), "--json"]
    )
    validate_analysis_args(args)
    assert load_builder_preferences(str(file))["sources"] == ["owned"]


# ---- Error paths ---- #


@pytest.mark.parametrize("contents", ["bad", "[]", '{"user_id":"other"}'])
def test_load_builder_preferences_invalid_file_rejects_before_login(tmp_path, contents) -> None:
    file = tmp_path / "preferences.json"
    file.write_text(contents)
    with pytest.raises(BrowserSessionError):
        load_builder_preferences(str(file))


def test_build_json_fantasy_mutation_is_not_supported() -> None:
    api = FantasyClient("http://api.test", "jwt")
    with pytest.raises(BrowserSessionError):
        api.build_json("/market/leagues/l1/bids", {})


# ---- Edge cases ---- #


def test_load_builder_preferences_absent_file_returns_defaults() -> None:
    assert load_builder_preferences(None)["allow_buying"] is False
