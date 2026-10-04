"""Scraper settings. ``SCRAPER_`` environment prefix; robots and limits cannot be disabled."""

from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

USER_AGENT_PREFIX: str = "LaLigaFantasyBuilder-Scraper/0.1.0"


class ScraperSettings(BaseSettings):
    """Process defaults for polite, cache-first scraping.

    Attributes:
        contact: URL or email appended to the default User-Agent. Required without an override.
        user_agent: Explicit User-Agent override.
        timeout_ms: Read timeout in milliseconds.
        rate_per_s: Sustained requests per second for the host.
        burst: Token bucket capacity.
        host_concurrency: Maximum in-flight requests for the host.
        global_concurrency: Maximum in-flight requests overall.
        jitter_ms: Inclusive random delay range added after each token.
        max_attempts: Attempts per request, including the first.
        max_redirects: Redirect hops followed manually.
        max_body_bytes: Decoded body cap for pages.
        max_sitemap_bytes: Decoded body cap for sitemaps.
        ttl_*_s: Fresh lifetimes in seconds.
        swr_*_s: Extra window during which stale values survive a failed refresh.
    """

    model_config = SettingsConfigDict(env_prefix="SCRAPER_", env_file=".env", extra="ignore")

    contact: str = ""
    user_agent: str = ""
    timeout_ms: int = Field(default=15_000, ge=1_000, le=60_000)
    rate_per_s: float = Field(default=1.5, gt=0, le=3)
    burst: int = Field(default=3, ge=1)
    host_concurrency: int = Field(default=4, ge=1)
    global_concurrency: int = Field(default=8, ge=1)
    jitter_ms: tuple[int, int] = (200, 600)
    max_attempts: int = Field(default=3, ge=1, le=5)
    max_redirects: int = Field(default=3, ge=0, le=3)
    max_body_bytes: int = 4 * 1024 * 1024
    max_sitemap_bytes: int = 8 * 1024 * 1024
    ttl_profile_s: int = 600
    ttl_market_s: int = 300
    ttl_competition_s: int = 21_600
    ttl_club_s: int = 600
    ttl_index_s: int = 86_400
    ttl_route_s: int = 604_800
    swr_page_s: int = 7_200
    swr_index_s: int = 604_800

    @model_validator(mode="after")
    def _require_identity(self) -> ScraperSettings:
        """Fail at startup when no contact or User-Agent can identify the scraper."""
        if not (self.user_agent or self.contact):
            raise ValueError("SCRAPER_CONTACT or SCRAPER_USER_AGENT is required")
        if not 10 <= len(self.effective_user_agent) <= 256 or "\n" in self.effective_user_agent:
            raise ValueError("user agent must be 10-256 characters without line breaks")
        return self

    @property
    def effective_user_agent(self) -> str:
        """Return the override, or the identifiable default."""
        return self.user_agent or f"{USER_AGENT_PREFIX} (+{self.contact})"


@lru_cache
def get_scraper_settings() -> ScraperSettings:
    """Load and cache scraper settings from the environment."""
    return ScraperSettings()
