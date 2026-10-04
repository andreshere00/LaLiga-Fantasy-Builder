"""Private HTTP process for the scraping service.

Health probes are open. ``/internal/scrape/*`` requires ``X-Service-Token``.
The FutbolFantasy parser stays a library.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from fantasy_scraping.config import Settings, get_settings
from fantasy_scraping.scraper.cache import MemoryCache
from fantasy_scraping.scraper.clock import SystemClock
from fantasy_scraping.scraper.errors import ScrapingError
from fantasy_scraping.scraper.http_client import ScrapingHttpClient
from fantasy_scraping.scraper.routes import health_router
from fantasy_scraping.scraper.routes import router as scrape_router
from fantasy_scraping.scraper.service import ScraperService
from fantasy_scraping.scraper.settings import get_scraper_settings


def build_service() -> tuple[ScraperService, ScrapingHttpClient]:
    """Compose the scraper from environment settings.

    Returns:
        The service and its HTTP client, so the caller can close the client.

    Raises:
        ValueError: ``SCRAPER_CONTACT`` and ``SCRAPER_USER_AGENT`` are both empty.
    """
    scraper_settings = get_scraper_settings()
    clock = SystemClock()
    client = ScrapingHttpClient(scraper_settings, clock=clock)
    return ScraperService(client, MemoryCache(clock), scraper_settings), client


class HealthResponse(BaseModel):
    """Liveness and readiness body."""

    status: str


def create_app(settings: Settings | None = None, service: ScraperService | None = None) -> FastAPI:
    """Build the scraping process.

    Args:
        settings: Optional settings. When omitted, values come from the environment.
        service: Optional scraper service, used by tests. Built lazily when omitted.

    Returns:
        The FastAPI application.

    Raises:
        RuntimeError: The service token is empty and debug mode is off.
    """
    cfg = settings or get_settings()
    token = cfg.scraping_service_token.get_secret_value()
    if not token and not cfg.debug:
        raise RuntimeError("scraping service token is required")
    holder: dict[str, ScrapingHttpClient | ScraperService] = {}
    if service is not None:
        holder["service"] = service

    def get_service() -> ScraperService:
        """Create the scraper on first use so health probes need no scraper settings."""
        if "service" not in holder:
            holder["service"], holder["client"] = build_service()
        return holder["service"]  # type: ignore[return-value]

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        """Close the HTTP client on shutdown."""
        yield
        if client := holder.get("client"):
            await client.aclose()  # type: ignore[union-attr]

    app = FastAPI(title="LaLiga Fantasy Builder Scraping", version="0.1.0", lifespan=lifespan)
    app.state.settings = cfg
    app.state.get_service = get_service
    app.include_router(scrape_router)
    app.include_router(health_router)

    @app.exception_handler(ScrapingError)
    async def scraping_error(_request: Request, exc: ScrapingError) -> JSONResponse:
        """Serialise failures as the repo-wide ``{error, detail}`` body."""
        return JSONResponse(
            status_code=exc.status_code, content={"error": exc.category, "detail": exc.message}
        )

    @app.get("/health/live", response_model=HealthResponse)
    @app.get("/health/ready", response_model=HealthResponse)
    def health() -> HealthResponse:
        """Return process liveness. Readiness does not call FutbolFantasy."""
        return HealthResponse(status="ok")

    return app


def run() -> None:
    """Start uvicorn on the configured port."""
    cfg = get_settings()
    uvicorn.run(
        "fantasy_scraping.main:create_app",
        factory=True,
        host="0.0.0.0",
        port=cfg.service_port,
    )
