"""Shared stadium forecast caching and kickoff-slot selection."""

from __future__ import annotations

import asyncio
import math
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from pydantic import ValidationError

from fantasy_api.domain.errors import UpstreamError
from fantasy_api.domain.ttl_cache import AsyncTtlCache
from fantasy_api.domain.venues import VenueEntry
from fantasy_api.domain.weather import FORECAST_HORIZON, ForecastSlot, pick_slot
from fantasy_api.schemas.player_stats import (
    MatchWeather,
    SegmentWarning,
    Venue,
    WeatherReason,
    WeatherSnapshot,
)
from fantasy_api.schemas.weather_provider import OpenWeatherForecast


@dataclass(frozen=True)
class ForecastResult:
    """Forecast with its original retrieval time and a sanitized warning."""

    weather: MatchWeather
    fetched_at: datetime | None = None
    warning: SegmentWarning | None = None


def forecast_slots(payload: Any) -> list[ForecastSlot]:
    """Validate forecast slots without turning absent temperatures into zero."""
    document = OpenWeatherForecast.model_validate(payload)
    slots: list[ForecastSlot] = []
    for row in document.list:
        if row.dt is None or row.main is None or row.main.temp is None:
            continue
        try:
            instant = datetime.fromtimestamp(row.dt, tz=UTC)
        except (ValueError, OverflowError, OSError):
            continue
        condition = row.weather[0] if row.weather else None
        rain = (row.rain or {}).get("3h")
        slots.append(
            ForecastSlot(
                dt=instant,
                temperature_c=row.main.temp,
                feels_like_c=row.main.feels_like,
                humidity_pct=row.main.humidity,
                wind_speed_ms=row.wind.speed if row.wind else None,
                precipitation_probability=row.pop,
                rain_mm=(
                    float(rain)
                    if isinstance(rain, int | float)
                    and not isinstance(rain, bool)
                    and math.isfinite(rain)
                    and rain >= 0
                    else None
                ),
                condition=condition.description or "" if condition else "",
                condition_code=condition.id if condition else None,
                icon=condition.icon if condition else None,
            )
        )
    return slots


class ForecastService:
    """Share successful per-coordinate forecasts across calendar and player reads.

    Args:
        fetch: Repository forecast method.
        ttl_seconds: Successful provider snapshot lifetime.
        clock: UTC clock used for slot eligibility and honest retrieval timestamps.
    """

    def __init__(
        self,
        fetch: Callable[[float, float], Awaitable[Any]],
        *,
        ttl_seconds: int,
        clock: Callable[[], datetime],
    ) -> None:
        self._fetch = fetch
        self._clock = clock
        self._ttl = ttl_seconds
        self._cache: dict[
            tuple[float, float], AsyncTtlCache[tuple[list[ForecastSlot], datetime]]
        ] = {}
        self._limit = asyncio.Semaphore(3)

    async def for_match(self, entry: VenueEntry | None, kickoff: datetime | None) -> ForecastResult:
        """Return the nearest eligible stadium forecast, or an explicit unavailable reason."""
        if entry is None:
            return ForecastResult(MatchWeather(reason=WeatherReason.VENUE_UNKNOWN))
        venue = Venue(
            club_key=entry.club_key,
            stadium=entry.stadium,
            city=entry.city,
            lat=entry.lat,
            lon=entry.lon,
            country=entry.country,
        )
        now = self._clock().astimezone(UTC)
        if kickoff is None or kickoff.tzinfo is None or kickoff <= now:
            return ForecastResult(MatchWeather(reason=WeatherReason.KICKOFF_UNKNOWN, venue=venue))
        if kickoff > now + FORECAST_HORIZON:
            return ForecastResult(MatchWeather(reason=WeatherReason.BEYOND_HORIZON, venue=venue))
        key = (entry.lat, entry.lon)
        cache = self._cache.setdefault(key, AsyncTtlCache(self._ttl))

        async def fetch() -> tuple[list[ForecastSlot], datetime]:
            """Bound provider fan-out and timestamp only successful retrievals."""
            async with self._limit:
                slots = forecast_slots(await self._fetch(entry.lat, entry.lon))
                if not slots:
                    raise UpstreamError("weather unavailable", category="weather_unavailable")
                return slots, self._clock().astimezone(UTC)

        try:
            slots, fetched_at = await cache.get_or_fetch(fetch)
        except (UpstreamError, ValidationError) as exc:
            status = exc.provider_status if isinstance(exc, UpstreamError) else None
            detail = (
                str(status) if status in {401, 429} or (status and status >= 500) else "timeout"
            )
            return ForecastResult(
                MatchWeather(reason=WeatherReason.PROVIDER_UNAVAILABLE, venue=venue),
                warning=SegmentWarning(
                    code="weather_unavailable", source="openweather", detail=detail
                ),
            )
        picked = pick_slot(slots, kickoff.astimezone(UTC), now)
        if isinstance(picked, WeatherReason):
            return ForecastResult(MatchWeather(reason=picked, venue=venue), fetched_at)
        return ForecastResult(
            MatchWeather(
                venue=venue,
                snapshot=WeatherSnapshot(
                    temperature_c=picked.temperature_c,
                    feels_like_c=picked.feels_like_c,
                    humidity_pct=picked.humidity_pct,
                    wind_speed_ms=picked.wind_speed_ms,
                    precipitation_probability=picked.precipitation_probability,
                    rain_mm=picked.rain_mm,
                    condition=picked.condition,
                    condition_code=picked.condition_code,
                    icon=picked.icon,
                    forecast_for=picked.dt,
                ),
            ),
            fetched_at,
        )
