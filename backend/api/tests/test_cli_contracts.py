# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import httpx
import pytest
from cli_http_stub import patch_httpx_client
from fantasy_api.cli.common import api_get

# ---- Error paths ---- #


def test_api_get_invalid_response_fails_schema_validation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_httpx_client(
        monkeypatch,
        {("GET", "/calendar/current"): {"unrelated": True}},
    )

    with pytest.raises(RuntimeError, match="unexpected response"):
        api_get("http://api.test", "/calendar/current")


def test_api_get_invalid_query_prevents_fetch(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=[])

    patch_httpx_client(monkeypatch, handler)

    with pytest.raises(RuntimeError, match="Invalid API request"):
        api_get(
            "http://api.test",
            "/players/4288/stats/fixtures",
            params={"last": 100},
        )

    assert seen == []
