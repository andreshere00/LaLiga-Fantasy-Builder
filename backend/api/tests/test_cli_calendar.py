# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json

import pytest
from cli_http_stub import patch_httpx_client
from fantasy_api.cli import calendar as calendar_cli

CURRENT = {
    "weekNumber": 8,
    "openingWeekDate": "2026-10-09T21:00:00+02:00",
    "closingWeekDate": "2026-10-13T03:00:00+02:00",
    "isLive": False,
}

FIXTURES = [
    {
        "id": "71",
        "matchDate": "2026-10-11T16:15:00+02:00",
        "localId": 16,
        "visitorId": 26,
        "localScore": 2,
        "visitorScore": 1,
    }
]

STATS = [{"id": 1, "localScore": 2, "visitorScore": 1}]


# ---- Happy path ---- #


def test_main_with_jwt_prints_matchweek_summary(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    routes = {
        ("GET", "/calendar/current"): CURRENT,
        ("GET", "/calendar/weeks/8"): FIXTURES,
        ("GET", "/calendar/weeks/8/stats"): STATS,
    }
    patch_httpx_client(monkeypatch, routes)

    code = calendar_cli.main(
        ["--jwt", "tok", "--api-base", "http://api.test"],
    )

    assert code == 0
    out = capsys.readouterr().out
    assert "Matchweek 8" in out
    assert "Fixtures (1)" in out
    assert "2-1" in out
    assert "Stats matches: 1" in out


def test_main_with_explicit_week_labels_current_matchday_window(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    routes = {
        ("GET", "/calendar/current"): CURRENT,
        ("GET", "/calendar/weeks/5"): FIXTURES,
        ("GET", "/calendar/weeks/5/stats"): STATS,
    }
    patch_httpx_client(monkeypatch, routes)

    code = calendar_cli.main(
        ["--jwt", "tok", "--api-base", "http://api.test", "--week", "5"],
    )

    assert code == 0
    out = capsys.readouterr().out
    assert out.startswith("Matchweek 5\n")
    assert "Current matchday (week 8):" in out
    assert "2026-10-09T21:00:00+02:00" in out
    assert "Matchweek 5\n  Window:" not in out


def test_main_json_mode_returns_aggregated_payload(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    routes = {
        ("GET", "/calendar/current"): CURRENT,
        ("GET", "/calendar/weeks/5"): FIXTURES,
        ("GET", "/calendar/weeks/5/stats"): STATS,
    }
    patch_httpx_client(monkeypatch, routes)

    code = calendar_cli.main(
        ["--jwt", "tok", "--api-base", "http://api.test", "--json", "--week", "5"],
    )

    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["week"] == 5
    assert payload["current"]["weekNumber"] == 8
    assert len(payload["fixtures"]) == 1


# ---- Error paths ---- #


def test_main_missing_jwt_returns_1(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    patch_httpx_client(monkeypatch, {})

    code = calendar_cli.main(["--api-base", "http://api.test"])

    assert code == 1
    assert "Missing credentials" in capsys.readouterr().err


def test_main_current_missing_week_number_returns_1(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    routes = {
        ("GET", "/calendar/current"): {
            "openingWeekDate": "2026-10-09T21:00:00+02:00",
            "closingWeekDate": "2026-10-13T03:00:00+02:00",
            "isLive": False,
        },
    }
    patch_httpx_client(monkeypatch, routes)

    code = calendar_cli.main(["--jwt", "tok", "--api-base", "http://api.test"])

    assert code == 1
    assert "Could not infer week" in capsys.readouterr().err
