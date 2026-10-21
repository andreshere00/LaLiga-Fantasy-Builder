"""Read-only weather provider access."""

from typing import Any

from fantasy_api.clients.openweather import OpenWeatherClient


class WeatherRepository:
    """Fetch forecasts through the process-lifetime OpenWeather client.

    Args:
        client: Server-side provider client; credentials never leave this layer.
    """

    def __init__(self, client: OpenWeatherClient) -> None:
        self._client = client

    async def get_forecast(self, lat: float, lon: float) -> Any:
        """Return a validated provider forecast for stadium coordinates."""
        return await self._client.forecast(lat, lon)
