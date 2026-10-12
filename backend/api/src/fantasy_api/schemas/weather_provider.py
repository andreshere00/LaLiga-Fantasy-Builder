"""OpenWeather response contracts used by the weather enrichment client."""

from __future__ import annotations

from fantasy_api.schemas.common import FlexibleModel, JsonObject


class OpenWeatherMain(FlexibleModel):
    """Temperatures and humidity for one forecast slot."""

    temp: float | None = None
    feels_like: float | None = None
    humidity: int | None = None


class OpenWeatherCondition(FlexibleModel):
    """Human-readable condition and its provider code."""

    id: int | None = None
    description: str | None = None
    icon: str | None = None


class OpenWeatherWind(FlexibleModel):
    """Wind speed for one forecast slot."""

    speed: float | None = None


class OpenWeatherForecastSlot(FlexibleModel):
    """One entry in the provider's three-hour forecast."""

    dt: int | None = None
    main: OpenWeatherMain | None = None
    weather: list[OpenWeatherCondition] | None = None
    wind: OpenWeatherWind | None = None
    pop: float | None = None
    rain: JsonObject | None = None


class OpenWeatherForecast(FlexibleModel):
    """Validated OpenWeather forecast envelope."""

    list: list[OpenWeatherForecastSlot]
