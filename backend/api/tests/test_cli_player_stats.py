# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json

import httpx
import pytest
from cli_http_stub import clear_cli_credential_env, patch_httpx_client
from fantasy_api.cli import player_stats as player_stats_cli

ENVELOPE = {
    "player_id": "4288",
    "season": "2026-27",
    "generated_at": "2026-10-12T10:00:00Z",
}
INDEX = {
    "player": {"id": "4288"},
    "season": "2026-27",
    "generated_at": "2026-10-12T10:00:00Z",
    "segments": [],
}
MARKET = {
    **ENVELOPE,
    "window": {
        "from": "2026-01-01",
        "to": "2026-10-01",
        "days": 30,
        "end_value": 120,
    },
}


def _routes(extra: dict[tuple[str, str], object] | None = None) -> dict[tuple[str, str], object]:
    base: dict[tuple[str, str], object] = {
        ("GET", "/players/4288/stats"): INDEX,
        ("GET", "/players/4288/stats/fixtures"): {**ENVELOPE, "fixtures": []},
        ("GET", "/players/4288/stats/market"): MARKET,
        ("GET", "/players/4288/stats/matches/recent"): {**ENVELOPE, "matches": []},
        ("GET", "/players/4288/stats/matches/upcoming"): {**ENVELOPE, "matches": []},
        ("GET", "/players/4288/stats/profile"): {
            **ENVELOPE,
            "injury": {},
            "start_probability": {},
            "injury_risk": {"level": "unknown"},
            "max_profitable_bid": {},
            "hierarchy": {},
        },
    }
    if extra:
        base.update(extra)
    return base


# ---- Happy path ---- #


def test_main_all_segments_json(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    patch_httpx_client(monkeypatch, _routes())

    code = player_stats_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--player-id",
            "4288",
            "--json",
        ],
    )

    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert set(payload["data"]) == {
        "index",
        "fixtures",
        "market",
        "recent",
        "upcoming",
        "profile",
    }
    assert payload["errors"] == {}


def test_main_single_segment_market_with_query_params(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    seen: list[str | None] = []

    def market_handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.params.get("preset"))
        return httpx.Response(200, json=MARKET)

    patch_httpx_client(
        monkeypatch,
        {("GET", "/players/4288/stats/market"): market_handler},
    )

    code = player_stats_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--player-id",
            "4288",
            "--segment",
            "market",
            "--preset",
            "30d",
            "--json",
        ],
    )

    assert code == 0
    assert seen == ["30d"]


def test_main_fixtures_and_matches_pass_optional_flags(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    seen: dict[str, object] = {}

    def fixtures_handler(request: httpx.Request) -> httpx.Response:
        seen["fixtures"] = dict(request.url.params.multi_items())
        return httpx.Response(200, json={**ENVELOPE, "fixtures": []})

    def recent_handler(request: httpx.Request) -> httpx.Response:
        seen["recent"] = dict(request.url.params.multi_items())
        return httpx.Response(200, json={**ENVELOPE, "matches": []})

    def upcoming_handler(request: httpx.Request) -> httpx.Response:
        seen["upcoming"] = dict(request.url.params.multi_items())
        return httpx.Response(200, json={**ENVELOPE, "matches": []})

    patch_httpx_client(
        monkeypatch,
        {
            ("GET", "/players/4288/stats/fixtures"): fixtures_handler,
            ("GET", "/players/4288/stats/matches/recent"): recent_handler,
            ("GET", "/players/4288/stats/matches/upcoming"): upcoming_handler,
        },
    )

    code = player_stats_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--player-id",
            "4288",
            "--segment",
            "fixtures",
            "--competition",
            "laliga",
            "--last",
            "5",
        ],
    )
    assert code == 0

    code = player_stats_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--player-id",
            "4288",
            "--segment",
            "recent",
            "--limit",
            "3",
            "--no-stats",
        ],
    )
    assert code == 0

    code = player_stats_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--player-id",
            "4288",
            "--segment",
            "upcoming",
            "--limit",
            "2",
            "--no-weather",
        ],
    )
    assert code == 0
    assert seen["fixtures"] == {"competition": "laliga", "last": "5"}
    assert seen["recent"] == {"limit": "3", "include_stats": "false"}
    assert seen["upcoming"] == {"limit": "2", "include_weather": "false"}


def test_main_detail_segment_single_request(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    detail = {
        "player_id": "4288",
        "player": {"id": "4288"},
        "season": "2026-27",
        "generated_at": "2026-10-12T10:00:00Z",
        "market": MARKET,
        "segment_errors": [
            {"segment": "fixtures", "code": "disabled", "detail": "segment disabled"}
        ],
    }
    seen: list[str] = []

    def detail_handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return httpx.Response(200, json=detail)

    patch_httpx_client(
        monkeypatch,
        {("GET", "/players/4288/stats/detail"): detail_handler},
    )

    code = player_stats_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--player-id",
            "4288",
            "--segment",
            "detail",
            "--json",
        ],
    )

    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["segment_errors"]
    assert seen == ["/players/4288/stats/detail"]


# ---- Error paths ---- #


def test_main_invalid_player_id_returns_2(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    patch_httpx_client(monkeypatch, _routes())

    code = player_stats_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--player-id",
            "not-a-id",
        ],
    )

    assert code == 2
    assert "invalid" in capsys.readouterr().err.lower()


def test_main_missing_credentials_returns_1(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clear_cli_credential_env(monkeypatch)

    code = player_stats_cli.main(
        [
            "--api-base",
            "http://api.test",
            "--player-id",
            "4288",
        ],
    )

    assert code == 1


def test_main_partial_api_errors_return_1(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    patch_httpx_client(
        monkeypatch,
        {
            ("GET", "/players/4288/stats"): INDEX,
            ("GET", "/players/4288/stats/market"): lambda _r: httpx.Response(502, text="bad"),
        },
    )

    code = player_stats_cli.main(
        [
            "--jwt",
            "tok",
            "--api-base",
            "http://api.test",
            "--player-id",
            "4288",
            "--segment",
            "all",
            "--json",
        ],
    )

    assert code == 1
    payload = json.loads(capsys.readouterr().out)
    assert "market" in payload["errors"]
