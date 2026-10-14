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

from fantasy_scraping.api.players import router as players_router
from fantasy_scraping.api.schemas import ErrorResponse
from fantasy_scraping.api.standings import router as standings_router
from fantasy_scraping.config import Settings, get_settings
from fantasy_scraping.parser.errors import ParserError
from fantasy_scraping.scraper.cache import MemoryCache
from fantasy_scraping.scraper.clock import SystemClock
from fantasy_scraping.scraper.errors import AmbiguousPlayerError, ScrapingError
from fantasy_scraping.scraper.http_client import ScrapingHttpClient
from fantasy_scraping.scraper.routes import health_router
from fantasy_scraping.scraper.routes import router as scrape_router
from fantasy_scraping.scraper.service import ScraperService
from fantasy_scraping.scraper.settings import get_scraper_settings
from fantasy_scraping.services.standings import (
    OfficialStandingsScraper,
    build_official_standings_scraper,
)


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


def create_app(
    settings: Settings | None = None,
    service: ScraperService | None = None,
    standings_service: OfficialStandingsScraper | None = None,
) -> FastAPI:
    """Build the scraping process.

    Args:
        settings: Optional settings. When omitted, values come from the environment.
        service: Optional scraper service, used by tests. Built lazily when omitted.
        standings_service: Optional official standings scraper for tests.

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
    official_service = standings_service
    official_client: ScrapingHttpClient | None = None

    def get_standings_service() -> OfficialStandingsScraper:
        """Lazily create the separate official-page scraper."""
        nonlocal official_service, official_client
        if official_service is None:
            official_service, official_client = build_official_standings_scraper(
                get_scraper_settings()
            )
        return official_service

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
        if official_client is not None:
            await official_client.aclose()

    serve_docs = cfg.debug or cfg.expose_docs
    app = FastAPI(
        title="LaLiga Fantasy Builder Scraping",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if serve_docs else None,
        redoc_url="/redoc" if serve_docs else None,
        openapi_url="/openapi.json" if serve_docs else None,
    )
    app.state.settings = cfg
    app.state.get_service = get_service
    app.state.get_standings_service = get_standings_service
    app.include_router(scrape_router)
    app.include_router(players_router)
    app.include_router(standings_router)
    app.include_router(health_router)

    @app.exception_handler(ParserError)
    async def parser_error(_request: Request, exc: ParserError) -> JSONResponse:
        """Map parser failures to stable API errors."""
        category = exc.code if exc.code else "scraping_error"
        body = ErrorResponse(error=category, detail=exc.detail)
        return JSONResponse(status_code=502, content=body.model_dump(mode="json"))

    @app.exception_handler(ScrapingError)
    async def scraping_error(_request: Request, exc: ScrapingError) -> JSONResponse:
        """Serialise failures as the repo-wide ``{error, detail}`` body."""
        candidates = exc.candidates if isinstance(exc, AmbiguousPlayerError) else None
        response_body = ErrorResponse(
            error=exc.category,
            detail=exc.message,
            candidates=candidates,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=response_body.model_dump(mode="json", exclude_none=True),
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
