"""OpenWeather response contracts used by the weather enrichment client."""

from __future__ import annotations

from pydantic import Field

from fantasy_api.schemas.common import FlexibleModel, JsonObject


class OpenWeatherMain(FlexibleModel):
    """Temperatures and humidity for one forecast slot."""

    temp: float | None = Field(default=None, allow_inf_nan=False)
    feels_like: float | None = Field(default=None, allow_inf_nan=False)
    humidity: int | None = Field(default=None, ge=0, le=100)


class OpenWeatherCondition(FlexibleModel):
    """Human-readable condition and its provider code."""

    id: int | None = None
    description: str | None = None
    icon: str | None = None


class OpenWeatherWind(FlexibleModel):
    """Wind speed for one forecast slot."""

    speed: float | None = Field(default=None, ge=0, allow_inf_nan=False)


class OpenWeatherForecastSlot(FlexibleModel):
    """One entry in the provider's three-hour forecast."""

    dt: int | None = None
    main: OpenWeatherMain | None = None
    weather: list[OpenWeatherCondition] | None = None
    wind: OpenWeatherWind | None = None
    pop: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    rain: JsonObject | None = None


class OpenWeatherForecast(FlexibleModel):
    """Validated OpenWeather forecast envelope."""

    list: list[OpenWeatherForecastSlot]
