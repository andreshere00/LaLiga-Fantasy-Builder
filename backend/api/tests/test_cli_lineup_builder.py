"""Read-only CLI request validation, contracts and error paths."""

# ---- Mocks, fixtures & helpers ---- #

import json
from pathlib import Path

import httpx
import pytest
from cli_http_stub import patch_httpx_client
from fantasy_api.cli.common import api_build
from fantasy_api.cli.lineup_builder import main
from fantasy_api.schemas.lineup_builder import BuildPreferences, BuildResponse

ROOT = Path(__file__).resolve().parents[3]


# ---- Happy path ---- #


def test_main_valid_request_only_posts_to_app_builder(monkeypatch, capsys, tmp_path) -> None:
    payload = json.loads((ROOT / "contracts/lineup-builder-response.json").read_text())["payload"]
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        """Assert this POST is the application planning route, never Fantasy."""
        requests.append(request)
        assert request.method == "POST"
        assert (
            request.url.path == "/lineup-builder/leagues/league%2Fid/build"
            or request.url.raw_path == b"/lineup-builder/leagues/league%2Fid/build"
        )
        assert request.headers["Authorization"] == "Bearer jwt"
        assert json.loads(request.content)["sources"] == ["owned"]
        return httpx.Response(200, json=payload)

    patch_httpx_client(monkeypatch, handler)
    assert main(["--league-id", "league/id", "--jwt", "jwt", "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["build_id"] == "fixture"
    assert len(requests) == 1


# ---- Error paths ---- #


@pytest.mark.parametrize("contents", ["{", "[]", '{"user_id":"other"}'])
def test_main_invalid_preferences_fails_before_authentication(
    monkeypatch, tmp_path, contents
) -> None:
    file = tmp_path / "preferences.json"
    file.write_text(contents)
    monkeypatch.setattr(
        "fantasy_api.cli.lineup_builder.resolve_jwt", lambda *a, **k: pytest.fail("login ran")
    )
    assert main(["--league-id", "league", "--preferences-file", str(file)]) == 2


def test_api_build_unregistered_mutation_is_rejected_before_http() -> None:
    with pytest.raises(RuntimeError, match="read-only"):
        api_build("http://test", "/market/leagues/l/bids", "jwt", {})


@pytest.mark.parametrize(
    "status,body",
    [(503, {"error": "financial_data_unavailable", "detail": "unavailable"}), (200, {})],
)
def test_api_build_bad_response_fails_closed(monkeypatch, status, body) -> None:
    patch_httpx_client(monkeypatch, lambda _: httpx.Response(status, json=body))
    with pytest.raises(RuntimeError):
        api_build("http://test", "/lineup-builder/leagues/l/build", "jwt", {})


# ---- Edge cases ---- #


def test_builder_shared_contracts_validate_with_api_models() -> None:
    for filename, model in (
        ("lineup-builder-response.json", BuildResponse),
        ("lineup-builder-request.json", BuildPreferences),
    ):
        raw = json.loads((ROOT / "contracts" / filename).read_text())["payload"]
        assert model.model_validate(raw).model_dump(mode="json") == raw
