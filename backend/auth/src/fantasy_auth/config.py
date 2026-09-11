"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the LaLiga Fantasy Builder auth module.

    Attributes:
        app_name: Parent application display name.
        debug: Enable verbose logging when True.
        use_memory_store: Use in-memory stores instead of Redis/Postgres.
        cookie_secure: Set Secure flag on session cookies.
        cookie_name: Name of the opaque session cookie.
        csrf_cookie_name: Name of the CSRF double-submit cookie.
        cors_origins: Allowed browser origins (exact match).
        session_ttl_seconds: Server-side session lifetime.
        pairing_ttl_seconds: One-time pairing lifetime.
        pairing_rate_limit_per_minute: Max complete attempts per IP.
        token_vault_key_base64: Base64-encoded 32-byte AES-GCM key.
        app_oidc_issuer: App identity provider issuer URL.
        app_oidc_client_id: App OIDC client ID.
        app_oidc_client_secret: App OIDC client secret (confidential).
        app_oidc_redirect_uri: Callback URL registered with the app IdP.
        app_oidc_authorize_url: App IdP authorize endpoint.
        app_oidc_token_url: App IdP token endpoint.
        app_oidc_jwks_url: App IdP JWKS endpoint.
        laliga_client_id: Public LaLiga B2C client ID.
        laliga_signin_policy: B2C policy for PKCE / refresh.
        laliga_base_url: B2C OAuth token endpoint base.
        laliga_issuer: Expected JWT issuer from B2C.
        laliga_redirect_uri: Native redirect URI for PKCE helper.
        laliga_fantasy_origin: Fantasy API origin.
        laliga_allow_id_token_fallback: Prefer id_token when access_token absent.
        refresh_skew_seconds: Refresh tokens this many seconds before exp.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "LaLiga Fantasy Builder Auth"
    debug: bool = False
    use_memory_store: bool = True

    cookie_secure: bool = True
    cookie_name: str = "fantasy_session"
    csrf_cookie_name: str = "fantasy_csrf"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    session_ttl_seconds: int = 86_400
    pairing_ttl_seconds: int = 600
    pairing_rate_limit_per_minute: int = 10

    token_vault_key_base64: str = Field(
        default="",
        description="Base64-encoded 32-byte key for AES-GCM token vault",
    )

    # App OIDC (own identity — not LaLiga)
    app_oidc_issuer: str = "https://idp.example.com/realms/fantasy"
    app_oidc_client_id: str = "change-me"
    app_oidc_client_secret: str = ""
    app_oidc_redirect_uri: str = "http://localhost:8000/auth/callback"
    app_oidc_authorize_url: str = (
        "https://idp.example.com/realms/fantasy/protocol/openid-connect/auth"
    )
    app_oidc_token_url: str = (
        "https://idp.example.com/realms/fantasy/protocol/openid-connect/token"
    )
    app_oidc_jwks_url: str = (
        "https://idp.example.com/realms/fantasy/protocol/openid-connect/certs"
    )

    # LaLiga B2C
    laliga_client_id: str = "af88bcff-1157-40a0-b579-030728aacf0b"
    laliga_signin_policy: str = "B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN"
    laliga_base_url: str = (
        "https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token"
    )
    laliga_issuer: str = (
        "https://login.laliga.es/335316eb-f606-4361-bb86-35a7edcdcec1/v2.0/"
    )
    laliga_redirect_uri: str = "authredirect://com.lfp.laligafantasy"
    laliga_fantasy_origin: str = "https://fantasy-api.llt-services.com"
    laliga_allow_id_token_fallback: bool = False

    refresh_skew_seconds: int = 60

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
