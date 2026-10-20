# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from fantasy_api.domain.venues import default_venue_directory
from fantasy_api.services.weather import ForecastService

NOW = datetime(2026, 10, 20, 12, tzinfo=UTC)
GROUND = default_venue_directory().for_club(fantasy_id=4, name=None)


def payload(*dates: datetime, temperature: float | None = -4) -> dict:
    """Return provider slots with an explicit temperature."""
    return {"list": [{"dt": int(dt.timestamp()), "main": {"temp": temperature}} for dt in dates]}


# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_for_match_concurrent_venues_limits_provider_fanout() -> None:
    active = peak = calls = 0

    async def fetch(lat: float, lon: float) -> dict:
        """Count overlapping provider reads."""
        nonlocal active, peak, calls
        calls += 1
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.001)
        active -= 1
        return payload(NOW + timedelta(days=1))

    service = ForecastService(fetch, ttl_seconds=1800, clock=lambda: NOW)
    assert GROUND is not None
    results = await asyncio.gather(
        *(
            service.for_match(replace(GROUND, lat=GROUND.lat + index), NOW + timedelta(days=1))
            for index in range(10)
        )
    )
    assert calls == 10 and peak == 3
    assert all(result.weather.snapshot.temperature_c == -4 for result in results)


@pytest.mark.asyncio
async def test_for_match_shared_venue_reuses_cache_with_original_retrieval_time() -> None:
    fetch = AsyncMock(return_value=payload(NOW + timedelta(days=1)))
    service = ForecastService(fetch, ttl_seconds=1800, clock=lambda: NOW)
    first, second = await asyncio.gather(
        *(service.for_match(GROUND, NOW + timedelta(days=1)) for _ in range(2))
    )
    assert fetch.await_count == 1
    assert first.fetched_at == second.fetched_at == NOW


# ---- Error paths ---- #


@pytest.mark.asyncio
async def test_for_match_missing_temperature_never_fabricates_zero() -> None:
    fetch = AsyncMock(return_value=payload(NOW + timedelta(days=1), temperature=None))
    result = await ForecastService(fetch, ttl_seconds=1800, clock=lambda: NOW).for_match(
        GROUND, NOW + timedelta(days=1)
    )
    assert result.weather.snapshot is None
    assert result.weather.reason == "provider_unavailable"


# ---- Edge cases ---- #


@pytest.mark.asyncio
async def test_for_match_five_day_boundary_uses_actual_provider_coverage() -> None:
    kickoff = NOW + timedelta(hours=120)
    fetch = AsyncMock(return_value=payload(kickoff))
    service = ForecastService(fetch, ttl_seconds=1800, clock=lambda: NOW)
    assert (await service.for_match(GROUND, kickoff)).weather.snapshot is not None
    assert (
        await service.for_match(GROUND, kickoff + timedelta(seconds=1))
    ).weather.reason == "beyond_forecast_horizon"
    assert fetch.await_count == 1


@pytest.mark.asyncio
async def test_for_match_nearest_slot_respects_ninety_minute_tolerance() -> None:
    kickoff = NOW + timedelta(days=1)
    service = ForecastService(
        AsyncMock(
            return_value=payload(kickoff - timedelta(minutes=90), kickoff + timedelta(hours=3))
        ),
        ttl_seconds=1800,
        clock=lambda: NOW,
    )
    assert (
        await service.for_match(GROUND, kickoff)
    ).weather.snapshot.forecast_for == kickoff - timedelta(minutes=90)
    assert (
        await service.for_match(GROUND, kickoff + timedelta(seconds=1))
    ).weather.reason == "beyond_forecast_horizon"
