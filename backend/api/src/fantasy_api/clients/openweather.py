"""OpenWeatherMap forecast client."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from pydantic import SecretStr

from fantasy_api.domain.errors import UpstreamError

logger = logging.getLogger(__name__)


class OpenWeatherClient:
    """Fetch 5-day / 3-hour forecasts."""

    def __init__(
        self,
        *,
        api_key: SecretStr | None,
        base_url: str,
        timeout_seconds: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        logging.getLogger("httpx").setLevel(logging.WARNING)
        self._http = httpx.AsyncClient(
            transport=transport,
            timeout=timeout_seconds,
        )

    @property
    def enabled(self) -> bool:
        """Return True when an API key is configured."""
        key = self._api_key.get_secret_value() if self._api_key else ""
        return bool(key)

    async def aclose(self) -> None:
        """Close the shared HTTP client."""
        await self._http.aclose()

    async def forecast(self, lat: float, lon: float) -> Any:
        """Return the raw forecast document for a coordinate pair."""
        if not self.enabled:
            raise UpstreamError(
                "weather disabled",
                status_code=503,
                category="weather_unavailable",
            )
        params = {
            "lat": str(lat),
            "lon": str(lon),
            "units": "metric",
            "lang": "es",
            "appid": self._api_key.get_secret_value() if self._api_key else "",
        }
        url = f"{self._base_url}/data/2.5/forecast"
        try:
            response = await self._http.get(url, params=params)
        except httpx.HTTPError as exc:
            logger.warning("weather request failed: %s", type(exc).__name__)
            raise UpstreamError(
                "weather unavailable",
                status_code=None,
                category="weather_unavailable",
            ) from None
        if response.status_code < 200 or response.status_code >= 300:
            raise UpstreamError(
                "weather unavailable",
                status_code=503,
                category="weather_unavailable",
                provider_status=response.status_code,
            )
        try:
            return response.json()
        except ValueError as exc:
            logger.warning("weather non-json: %s", type(exc).__name__)
            raise UpstreamError(
                "weather unavailable",
                status_code=503,
                category="weather_unavailable",
            ) from None
