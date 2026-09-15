"""FastAPI factory for the Fantasy Builder API."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from fantasy_api.api import leagues, me
from fantasy_api.api.deps import AppContainer, build_container, set_container
from fantasy_api.config import Settings, get_settings
from fantasy_api.domain.errors import NeedsReauthError, UnauthorizedError, UpstreamError


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    container: AppContainer | None = getattr(app.state, "container", None)
    if container is None:
        container = build_container(app.state.settings)
        app.state.container = container
    set_container(container)
    yield


def create_app(
    settings: Settings | None = None,
    container: AppContainer | None = None,
) -> FastAPI:
    """Build the FastAPI application.

    Args:
        settings: Optional settings override.
        container: Optional pre-wired container (tests).

    Returns:
        Configured FastAPI app.
    """
    cfg = settings or get_settings()
    app = FastAPI(title=cfg.app_name, version="0.1.0", lifespan=_lifespan)
    app.state.settings = cfg
    if container is not None:
        app.state.container = container
        set_container(container)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
    )
    app.include_router(me.router)
    app.include_router(leagues.router)

    @app.get("/health")
    @app.get("/health/live")
    async def health_live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready")
    async def health_ready() -> dict[str, str]:
        return {"status": "ok"}

    @app.exception_handler(UnauthorizedError)
    async def unauthorized_handler(
        _request: Request,
        exc: UnauthorizedError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content={"error": "unauthorized", "detail": str(exc)},
        )

    @app.exception_handler(NeedsReauthError)
    async def needs_reauth_handler(
        _request: Request,
        exc: NeedsReauthError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content={"error": "needs_reauth", "detail": str(exc)},
        )

    @app.exception_handler(UpstreamError)
    async def upstream_handler(
        _request: Request,
        exc: UpstreamError,
    ) -> JSONResponse:
        status = exc.status_code or 502
        return JSONResponse(
            status_code=status if 400 <= status < 600 else 502,
            content={"error": exc.category, "detail": str(exc)},
        )

    return app


def run() -> None:
    """Run the API with uvicorn."""
    import uvicorn

    uvicorn.run(
        "fantasy_api.main:create_app",
        factory=True,
        host="0.0.0.0",
        port=8001,
        reload=False,
    )


def __getattr__(name: str) -> FastAPI:
    if name == "app":
        return create_app()
    raise AttributeError(name)
