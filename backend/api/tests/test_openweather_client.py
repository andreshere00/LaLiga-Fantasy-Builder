# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import httpx
import pytest
from fantasy_api.clients.openweather import OpenWeatherClient
from fantasy_api.domain.errors import UpstreamError
from pydantic import SecretStr

# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_forecast_success_returns_json() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert "appid=weather-key" in str(request.url)
        return httpx.Response(200, json={"list": []})

    client = OpenWeatherClient(
        api_key=SecretStr("weather-key"),
        base_url="https://weather.test",
        timeout_seconds=5.0,
        transport=httpx.MockTransport(handler),
    )
    payload = await client.forecast(41.38, 2.12)
    await client.aclose()
    assert payload == {"list": []}
    assert client.enabled is True


# ---- Error paths ---- #


@pytest.mark.asyncio
async def test_forecast_disabled_raises_weather_unavailable() -> None:
    client = OpenWeatherClient(
        api_key=None,
        base_url="https://weather.test",
        timeout_seconds=5.0,
    )
    with pytest.raises(UpstreamError) as exc:
        await client.forecast(41.38, 2.12)
    assert exc.value.category == "weather_unavailable"


@pytest.mark.asyncio
async def test_forecast_upstream_500_raises() -> None:
    client = OpenWeatherClient(
        api_key=SecretStr("weather-key"),
        base_url="https://weather.test",
        timeout_seconds=5.0,
        transport=httpx.MockTransport(lambda r: httpx.Response(503, text="down")),
    )
    with pytest.raises(UpstreamError) as exc:
        await client.forecast(41.38, 2.12)
    await client.aclose()
    assert exc.value.category == "weather_unavailable"
