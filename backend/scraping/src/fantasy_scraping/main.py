"""Private HTTP process for the scraping service.

The downloader is not in this process yet. Compose can reach ``/health/live``
and ``/health/ready``. The FutbolFantasy parser stays a library.
"""

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

from fantasy_scraping.config import Settings, get_settings


class HealthResponse(BaseModel):
    """Liveness and readiness body."""

    status: str


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the scraping process.

    Args:
        settings: Optional settings. When omitted, values come from the environment.

    Returns:
        The FastAPI application.

    Raises:
        RuntimeError: The service token is empty and debug mode is off.
    """
    cfg = settings or get_settings()
    token = cfg.scraping_service_token.get_secret_value()
    if not token and not cfg.debug:
        raise RuntimeError("scraping service token is required")
    app = FastAPI(title="LaLiga Fantasy Builder Scraping", version="0.1.0")
    app.state.settings = cfg

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
