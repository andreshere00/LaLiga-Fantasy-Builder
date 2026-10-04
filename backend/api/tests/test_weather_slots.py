# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fantasy_api.domain.weather import ForecastSlot, pick_slot
from fantasy_api.schemas.player_stats import WeatherReason

# ---- Happy path ---- #


def test_pick_slot_chooses_nearest_within_tolerance() -> None:
    now = datetime(2026, 10, 4, 12, 0, tzinfo=UTC)
    kickoff = now + timedelta(days=2)
    slots = [
        ForecastSlot(
            dt=kickoff,
            temperature_c=20.0,
            feels_like_c=None,
            humidity_pct=None,
            wind_speed_ms=None,
            precipitation_probability=None,
            rain_mm=None,
            condition="despejado",
            condition_code=None,
            icon=None,
        )
    ]
    picked = pick_slot(slots, kickoff, now)
    assert isinstance(picked, ForecastSlot)


# ---- Edge cases ---- #


def test_pick_slot_beyond_horizon() -> None:
    now = datetime(2026, 10, 4, 12, 0, tzinfo=UTC)
    kickoff = now + timedelta(days=10)
    assert pick_slot([], kickoff, now) == WeatherReason.BEYOND_HORIZON
    near = now + timedelta(days=1)
    assert pick_slot([], near, now) == WeatherReason.PROVIDER_UNAVAILABLE
