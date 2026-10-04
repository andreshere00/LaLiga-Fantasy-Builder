"""OpenWeather forecast slot selection (pure)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from fantasy_api.schemas.player_stats import WeatherReason

FORECAST_HORIZON = timedelta(hours=120)
SLOT_TOLERANCE = timedelta(minutes=90)


@dataclass(frozen=True, slots=True)
class ForecastSlot:
    """One forecast time slot from OpenWeather."""

    dt: datetime
    temperature_c: float
    feels_like_c: float | None
    humidity_pct: int | None
    wind_speed_ms: float | None
    precipitation_probability: float | None
    rain_mm: float | None
    condition: str
    condition_code: int | None
    icon: str | None


def pick_slot(
    slots: list[ForecastSlot],
    kickoff_utc: datetime | None,
    now_utc: datetime,
) -> ForecastSlot | WeatherReason:
    """Choose the nearest 3h slot to kickoff within tolerance."""
    if kickoff_utc is None:
        return WeatherReason.KICKOFF_UNKNOWN
    if kickoff_utc <= now_utc:
        return WeatherReason.KICKOFF_UNKNOWN
    if kickoff_utc > now_utc + FORECAST_HORIZON:
        return WeatherReason.BEYOND_HORIZON
    if not slots:
        return WeatherReason.PROVIDER_UNAVAILABLE
    last = max(slot.dt for slot in slots)
    if kickoff_utc > last:
        return WeatherReason.BEYOND_HORIZON
    best: ForecastSlot | None = None
    best_delta = SLOT_TOLERANCE + timedelta(seconds=1)
    for slot in slots:
        delta = abs(slot.dt - kickoff_utc)
        if delta <= best_delta:
            best_delta = delta
            best = slot
    if best is None:
        return WeatherReason.BEYOND_HORIZON
    return best
