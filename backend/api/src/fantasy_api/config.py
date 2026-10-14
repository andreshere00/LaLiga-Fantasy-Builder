"""Application settings for the Fantasy Builder API."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, PositiveInt, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the Fantasy Builder API."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "LaLiga Fantasy Builder API"
    debug: bool = False
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    auth_jwks_url: str = "http://localhost:8000/.well-known/jwks.json"
    internal_jwt_issuer: str = "https://auth.fantasy-builder.local"
    internal_jwt_audience: str = "fantasy-api"
    auth_internal_base_url: str = "http://localhost:8000"
    internal_service_token: str = ""

    laliga_fantasy_origin: str = "https://fantasy-api.llt-services.com"
    laliga_competition_id: int = 1

    api_football_key: SecretStr | None = None
    standings_source: Literal["laliga-fixtures", "api-football"] = "laliga-fixtures"
    standings_provider_league_id: int = Field(default=140, gt=0)
    standings_timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    standings_ttl_seconds: int = Field(default=3600, ge=3600, le=86400)
    standings_club_ids: dict[PositiveInt, PositiveInt] = Field(default_factory=dict)

    scraping_base_url: str = ""
    scraping_service_token: SecretStr = SecretStr("")
    scraping_timeout_seconds: float = 30.0
    scraping_max_concurrency: int = 4

    openweather_api_key: SecretStr | None = None
    openweather_base_url: str = "https://api.openweathermap.org"
    openweather_timeout_seconds: float = 5.0

    player_catalog_ttl_seconds: int = 900
    scraped_player_ttl_seconds: int = 900
    weather_ttl_seconds: int = 1800
    market_history_ttl_seconds: int = 300
    teams_master_ttl_seconds: int = 86400
    player_stats_rate_limit_per_minute: int = 60

    lineup_explanations_enabled: bool = False
    lineup_explanation_model: str | None = None
    lineup_explanation_efforts: dict[str, list[Literal["low", "medium", "high"]]] = Field(
        default_factory=dict
    )
    openai_api_key: SecretStr | None = None

    @model_validator(mode="after")
    def _explanation_configuration(self) -> Settings:
        """Require explicit server model and credentials before enabling paid prose."""
        if self.lineup_explanations_enabled and (
            not self.lineup_explanation_model or not self.openai_api_key
        ):
            raise ValueError("Explanations require LINEUP_EXPLANATION_MODEL and OPENAI_API_KEY")
        return self

    log_level: str = "INFO"
    log_json: bool = True

    @model_validator(mode="after")
    def _scraping_token_required(self) -> Settings:
        if self.scraping_base_url and not self.scraping_service_token.get_secret_value():
            raise ValueError("SCRAPING_SERVICE_TOKEN is required when SCRAPING_BASE_URL is set")
        return self


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings singleton."""
    return Settings()
