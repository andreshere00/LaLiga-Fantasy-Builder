# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fantasy_api.main import create_app
from fastapi.testclient import TestClient
from jwt_mint import mint_internal_jwt
from pydantic import SecretStr
from test_calendar import rsa_pems as rsa_pems
from test_container import build_test_container
from test_container import test_settings as api_test_settings

NOW = datetime(2026, 10, 20, 12, tzinfo=UTC)
KICKOFF = NOW + timedelta(days=1)
WEATHER_KEY = "weather-test-secret"


def fixture(**changes: object) -> dict:
    """Build one calendar fixture with verified club ids."""
    return {
        "id": "91",
        "localId": 4,
        "visitorId": 15,
        "matchState": 1,
        "matchDate": KICKOFF.isoformat(),
        **changes,
    }


def forecast(**changes: object) -> dict:
    """Build a minimal valid zero-valued forecast."""
    return {
        "list": [
            {
                "dt": int(KICKOFF.timestamp()),
                "main": {"temp": 0, "humidity": 0},
                "wind": {"speed": 0},
                "pop": 0,
                "weather": [{"id": 800, "description": "clear", "icon": "01d"}],
                **changes,
            }
        ]
    }


def make_client(
    public_pem: str,
    rows: object,
    *,
    payload: object = None,
    status: int = 200,
    enabled: bool = True,
    calendar_status: int = 200,
):
    """Wire calendar and weather transports without account bearer exchange."""
    calls: list[httpx.Request] = []

    def public_calendar(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/competition/1/calendar"
        assert request.url.params["weekNumber"] == "10"
        assert "authorization" not in request.headers
        return httpx.Response(calendar_status, json=rows)

    def weather(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.url.path == "/data/2.5/forecast"
        assert request.url.params["units"] == "metric"
        assert request.url.params["appid"] == WEATHER_KEY
        assert "authorization" not in request.headers
        return httpx.Response(status, json=forecast() if payload is None else payload)

    def no_bearer(request: httpx.Request) -> httpx.Response:
        raise AssertionError("Calendar weather must not exchange a LaLiga bearer")

    settings = api_test_settings().model_copy(
        update={
            "openweather_api_key": SecretStr(WEATHER_KEY if enabled else ""),
        }
    )
    container = build_test_container(
        public_pem,
        settings=settings,
        fantasy_handler=httpx.MockTransport(public_calendar),
        auth_handler=httpx.MockTransport(no_bearer),
        weather_transport=httpx.MockTransport(weather),
    )
    container.calendar_weather_service._clock = lambda: NOW
    container.calendar_weather_service._forecasts._clock = lambda: NOW
    return TestClient(create_app(settings=settings, container=container)), calls


# ---- Happy path ---- #


def test_get_week_weather_valid_fixture_returns_zero_values_and_original_time(rsa_pems) -> None:
    private, public = rsa_pems
    client, calls = make_client(public, [fixture()])
    with client:
        response = client.get(
            "/calendar/weeks/10/weather",
            headers={
                "Authorization": f"Bearer {mint_internal_jwt(private)}",
            },
        )
        repeated = client.get(
            "/calendar/weeks/10/weather",
            headers={
                "Authorization": f"Bearer {mint_internal_jwt(private)}",
            },
        )
    assert response.status_code == 200
    row = response.json()["matches"][0]
    assert row["fixtureId"] == "91" and row["localId"] == 4 and row["visitorId"] == 15
    assert row["weather"]["snapshot"]["temperature_c"] == 0
    assert row["weather"]["snapshot"]["precipitation_probability"] == 0
    assert row["weather"]["snapshot"]["wind_speed_ms"] == 0
    assert row["fetchedAt"] == repeated.json()["matches"][0]["fetchedAt"]
    assert len(calls) == 1
    assert calls[0].url.params["lat"] == "41.3809"
    assert WEATHER_KEY not in response.text


def test_get_week_weather_repeated_venue_coalesces_provider_calls(rsa_pems) -> None:
    private, public = rsa_pems
    client, calls = make_client(public, [fixture(), fixture(id="92", visitorId=3)])
    with client:
        response = client.get(
            "/calendar/weeks/10/weather",
            headers={
                "Authorization": f"Bearer {mint_internal_jwt(private)}",
            },
        )
    assert response.status_code == 200
    assert len(response.json()["matches"]) == 2
    assert len(calls) == 1


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "status,payload",
    [
        (401, {}),
        (429, {}),
        (500, {}),
        (200, {"list": "bad"}),
        (200, forecast(main={"temp": None})),
        (200, forecast(pop=2)),
        (200, forecast(wind={"speed": -1})),
    ],
)
def test_get_week_weather_provider_failure_returns_optional_reason(
    rsa_pems, status, payload
) -> None:
    private, public = rsa_pems
    client, _ = make_client(public, [fixture()], status=status, payload=payload)
    with client:
        response = client.get(
            "/calendar/weeks/10/weather",
            headers={
                "Authorization": f"Bearer {mint_internal_jwt(private)}",
            },
        )
    assert response.status_code == 200
    assert response.json()["matches"][0]["weather"]["reason"] == "provider_unavailable"
    assert WEATHER_KEY not in response.text and "appid" not in response.text


@pytest.mark.parametrize("rows", [{"bad": []}, ["bad"], [{"unknown": 1}], [fixture(), fixture()]])
def test_get_week_weather_invalid_calendar_returns_502(rsa_pems, rows) -> None:
    private, public = rsa_pems
    client, calls = make_client(public, rows)
    with client:
        response = client.get(
            "/calendar/weeks/10/weather",
            headers={
                "Authorization": f"Bearer {mint_internal_jwt(private)}",
            },
        )
    assert response.status_code == 502 and not calls


def test_get_week_weather_missing_jwt_returns_401_without_upstream_calls(rsa_pems) -> None:
    client, calls = make_client(rsa_pems[1], [fixture()])
    with client:
        response = client.get("/calendar/weeks/10/weather")
    assert response.status_code == 401 and not calls


def test_get_week_weather_calendar_failure_stays_error(rsa_pems) -> None:
    private, public = rsa_pems
    client, calls = make_client(public, {"secret": WEATHER_KEY}, calendar_status=503)
    with client:
        response = client.get(
            "/calendar/weeks/10/weather",
            headers={
                "Authorization": f"Bearer {mint_internal_jwt(private)}",
            },
        )
    assert response.status_code == 503 and not calls
    assert WEATHER_KEY not in response.text


# ---- Edge cases ---- #


@pytest.mark.parametrize(
    "changes,enabled,reason",
    [
        ({}, False, "disabled"),
        ({"matchDate": (NOW + timedelta(days=6)).isoformat()}, True, "beyond_forecast_horizon"),
        ({"localId": 99999}, True, "venue_unknown"),
        ({"neutralVenue": True}, True, "venue_unknown"),
        ({"matchDate": "2026-10-21"}, True, "kickoff_unknown"),
        ({"matchDate": (NOW - timedelta(hours=1)).isoformat()}, True, "match_started"),
        ({"matchState": 7}, True, "match_started"),
        ({"matchState": 999}, True, "status_unknown"),
    ],
)
def test_get_week_weather_ineligible_match_skips_provider(
    rsa_pems, changes, enabled, reason
) -> None:
    private, public = rsa_pems
    client, calls = make_client(public, [fixture(**changes)], enabled=enabled)
    with client:
        response = client.get(
            "/calendar/weeks/10/weather",
            headers={
                "Authorization": f"Bearer {mint_internal_jwt(private)}",
            },
        )
    assert response.status_code == 200
    assert response.json()["matches"][0]["weather"]["reason"] == reason
    assert not calls


def test_get_week_weather_partial_venue_failure_keeps_other_forecasts(rsa_pems) -> None:
    private, public = rsa_pems
    client, calls = make_client(public, [fixture(), fixture(id="92", localId=99999)])
    with client:
        response = client.get(
            "/calendar/weeks/10/weather",
            headers={
                "Authorization": f"Bearer {mint_internal_jwt(private)}",
            },
        )
    first, second = response.json()["matches"]
    assert first["weather"]["snapshot"] is not None
    assert second["weather"]["reason"] == "venue_unknown"
    assert len(calls) == 1


def test_get_week_weather_empty_calendar_returns_explicit_empty_matches(rsa_pems) -> None:
    private, public = rsa_pems
    client, calls = make_client(public, [])
    with client:
        response = client.get(
            "/calendar/weeks/10/weather",
            headers={
                "Authorization": f"Bearer {mint_internal_jwt(private)}",
            },
        )
    assert response.status_code == 200 and response.json()["matches"] == [] and not calls
