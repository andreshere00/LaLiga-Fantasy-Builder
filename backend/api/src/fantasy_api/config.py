"""Application settings for the Fantasy Builder API."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the Fantasy Builder API.

    Attributes:
        app_name: Service display name.
        debug: Verbose mode flag.
        cors_origins: Browser origin allow-list.
        auth_jwks_url: Auth service JWKS URL for internal JWTs.
        internal_jwt_issuer: Expected JWT issuer.
        internal_jwt_audience: Expected JWT audience.
        auth_internal_base_url: Auth service base URL for private calls.
        internal_service_token: Shared ``X-Service-Token`` secret.
        laliga_fantasy_origin: LaLiga Fantasy API origin.
        laliga_competition_id: Competition id used in Fantasy paths.
        log_level: Root log level.
        log_json: Emit JSON logs when True.
    """

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

    log_level: str = "INFO"
    log_json: bool = True


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings singleton.

    Returns:
        Application settings instance.
    """
    return Settings()
