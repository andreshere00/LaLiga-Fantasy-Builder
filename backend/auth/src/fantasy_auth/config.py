"""Application settings loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration for LaLiga delegation and identity token verification."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "LaLiga Fantasy Builder Auth"
    debug: bool = False
    use_memory_store: bool = True

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    frontend_origin: str = "http://localhost:3000"

    pairing_ttl_seconds: int = 600
    pairing_rate_limit_per_minute: int = 10

    token_vault_key_base64: str = Field(
        default="",
        description="Base64-encoded 32-byte key for AES-GCM token vault",
    )

    database_url: str = ""
    redis_url: str = ""

    # LaLiga B2C
    laliga_client_id: str = "af88bcff-1157-40a0-b579-030728aacf0b"
    laliga_signin_policy: str = "B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN"
    laliga_base_url: str = (
        "https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token"
    )
    laliga_issuer: str = "https://login.laliga.es/335316eb-f606-4361-bb86-35a7edcdcec1/v2.0/"
    laliga_redirect_uri: str = "authredirect://com.lfp.laligafantasy"
    laliga_browser_redirect_uri: str | None = None
    laliga_fantasy_origin: str = "https://fantasy-api.llt-services.com"
    laliga_allow_id_token_fallback: bool = False

    refresh_skew_seconds: int = 60

    otel_service_name: str = "laliga-fantasy-builder-auth"
    otel_exporter_otlp_endpoint: str | None = None
    log_level: str = "INFO"
    log_json: bool = True
    migration_auto_apply: bool = False

    # Cross-service internal JWT + service credential
    internal_jwt_issuer: str = "http://localhost:3000/auth"
    internal_jwt_audience: str = "fantasy-api"
    auth_jwks_url: str = "http://localhost:8003/auth/jwks"
    internal_service_token: str = ""

    @model_validator(mode="after")
    def validate_browser_redirect(self) -> Settings:
        """Accept only an HTTPS callback on the configured frontend origin."""
        if self.laliga_browser_redirect_uri is None:
            return self
        from urllib.parse import urlparse

        callback = urlparse(self.laliga_browser_redirect_uri)
        origin = urlparse(self.frontend_origin)
        if (
            callback.scheme != "https"
            or origin.scheme != "https"
            or callback.netloc != origin.netloc
            or origin.path
            or origin.params
            or origin.query
            or origin.fragment
            or origin.username
            or origin.password
            or callback.path != "/laliga/callback"
            or callback.params
            or callback.query
            or callback.fragment
            or callback.username
            or callback.password
        ):
            raise ValueError(
                "LALIGA_BROWSER_REDIRECT_URI must be the HTTPS frontend /laliga/callback URL"
            )
        return self

    @property
    def laliga_authorize_url(self) -> str:
        """Derive the B2C authorize endpoint from the token base URL.

        Returns:
            Authorize URL without query parameters.
        """
        return self.laliga_base_url.replace("/token", "/authorize")

    @property
    def laliga_discovery_base(self) -> str:
        """Tenant base used for OIDC discovery and JWKS.

        Returns:
            Tenant root URL under login.laliga.es.
        """
        # …/oauth2/v2.0/token -> …/ (tenant root)
        marker = "/oauth2/v2.0/token"
        if marker in self.laliga_base_url:
            return self.laliga_base_url[: self.laliga_base_url.index(marker)]
        return "https://login.laliga.es/laligadspprob2c.onmicrosoft.com"


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings singleton.

    Returns:
        Application settings instance.
    """
    return Settings()
