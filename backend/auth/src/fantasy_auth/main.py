"""FastAPI factory for the LaLiga Fantasy Builder auth module entrypoint."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from fantasy_auth.api import internal_credentials, pairings
from fantasy_auth.api.deps import (
    AppContainer,
    build_container,
    get_container,
    set_container,
)
from fantasy_auth.api.middleware import (
    RedactedAccessLogMiddleware,
    SecurityHeadersMiddleware,
    install_cors,
)
from fantasy_auth.api.schemas import (
    AuthErrorResponse,
    HealthNotReadyResponse,
    HealthReadyResponse,
    HealthResponse,
)
from fantasy_auth.config import Settings, get_settings
from fantasy_auth.domain.errors import (
    AuthError,
    NeedsReauth,
    OwnershipError,
    PairingError,
    ProviderError,
    SessionError,
    ValidationError,
)
from fantasy_auth.observability import configure_logging, configure_tracing, get_tracer
from fantasy_auth.startup import StartupError, log_vault_key_status, resolve_vault_key


async def _create_runtime_resources(
    settings: Settings,
) -> tuple[Any | None, Any | None]:
    """Create Postgres/Redis clients when not using memory stores.

    Args:
        settings: Application settings.

    Returns:
        Tuple of ``(pg_pool, redis_client)``.
    """
    if settings.use_memory_store:
        return None, None

    import asyncpg
    from redis.asyncio import Redis

    pool = await asyncpg.create_pool(dsn=settings.database_url, min_size=1, max_size=10)
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    await redis.ping()
    if settings.migration_auto_apply:
        from fantasy_auth.migrate import apply_migrations

        await apply_migrations(pool)
    return pool, redis


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    container: AppContainer | None = getattr(app.state, "container", None)
    pg_pool = None
    redis = None
    tracer = get_tracer()
    try:
        with tracer.start_as_current_span("auth.startup") as span:
            _, used_dev = resolve_vault_key(settings)
            log_vault_key_status(used_dev_fallback=used_dev)
            span.set_attribute("vault.dev_fallback", used_dev)
            if container is None:
                pg_pool, redis = await _create_runtime_resources(settings)
                container = build_container(
                    settings,
                    pg_pool=pg_pool,
                    redis=redis,
                )
                set_container(container)
                app.state.container = container
            else:
                set_container(container)
        yield
    finally:
        container = getattr(app.state, "container", None)
        if container is not None:
            if container.redis is not None:
                await container.redis.aclose()
            if container.pg_pool is not None:
                await container.pg_pool.close()


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
    configure_logging(cfg)

    app = FastAPI(
        title=cfg.app_name,
        version="0.1.0",
        lifespan=_lifespan,
    )
    app.state.settings = cfg
    if container is not None:
        app.state.container = container
        set_container(container)

    configure_tracing(cfg, app=app)
    install_cors(app, cfg.cors_origins)
    app.add_middleware(RedactedAccessLogMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)

    app.include_router(internal_credentials.router)
    app.include_router(pairings.router)

    @app.get("/health", tags=["health"], response_model=HealthResponse)
    @app.get("/health/live", tags=["health"], response_model=HealthResponse)
    async def health_live() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.get(
        "/health/ready",
        tags=["health"],
        response_model=HealthReadyResponse,
        responses={503: {"model": HealthNotReadyResponse}},
    )
    async def health_ready() -> JSONResponse:
        runtime = get_container() if container is None else container
        if runtime.settings.use_memory_store:
            body = HealthReadyResponse(status="ok", store="memory")
            return JSONResponse(body.model_dump(mode="json"))
        try:
            if runtime.pg_pool is not None:
                async with runtime.pg_pool.acquire() as conn:
                    await conn.fetchval("SELECT 1")
            if runtime.redis is not None:
                await runtime.redis.ping()
        except Exception:
            body = HealthNotReadyResponse(
                status="not_ready",
                detail="dependency unavailable",
            )
            return JSONResponse(
                status_code=503,
                content=body.model_dump(mode="json"),
            )
        body = HealthReadyResponse(status="ok", store="postgres+redis")
        return JSONResponse(body.model_dump(mode="json"))

    @app.exception_handler(StartupError)
    async def startup_error_handler(
        _request: Request,
        exc: StartupError,
    ) -> JSONResponse:
        body = AuthErrorResponse(error="startup_error", detail=str(exc))
        return JSONResponse(status_code=503, content=body.model_dump(mode="json"))

    @app.exception_handler(SessionError)
    async def session_error_handler(
        _request: Request,
        exc: SessionError,
    ) -> JSONResponse:
        body = AuthErrorResponse(error="unauthorized", detail=str(exc))
        return JSONResponse(status_code=401, content=body.model_dump(mode="json"))

    @app.exception_handler(OwnershipError)
    async def ownership_error_handler(
        _request: Request,
        exc: OwnershipError,
    ) -> JSONResponse:
        body = AuthErrorResponse(error="forbidden", detail=str(exc))
        return JSONResponse(status_code=403, content=body.model_dump(mode="json"))

    @app.exception_handler(PairingError)
    async def pairing_error_handler(
        _request: Request,
        exc: PairingError,
    ) -> JSONResponse:
        status = {"rate_limited": 429, "browser_unavailable": 503}.get(exc.category, 400)
        body = AuthErrorResponse(error=exc.category, detail=str(exc))
        return JSONResponse(status_code=status, content=body.model_dump(mode="json"))

    @app.exception_handler(NeedsReauth)
    async def needs_reauth_handler(
        _request: Request,
        exc: NeedsReauth,
    ) -> JSONResponse:
        body = AuthErrorResponse(error="needs_reauth", detail=str(exc))
        return JSONResponse(status_code=401, content=body.model_dump(mode="json"))

    @app.exception_handler(ValidationError)
    async def validation_error_handler(
        _request: Request,
        exc: ValidationError,
    ) -> JSONResponse:
        body = AuthErrorResponse(error=exc.category, detail=str(exc))
        return JSONResponse(status_code=400, content=body.model_dump(mode="json"))

    @app.exception_handler(ProviderError)
    async def provider_error_handler(
        _request: Request,
        exc: ProviderError,
    ) -> JSONResponse:
        status = exc.status_code or 502
        body = AuthErrorResponse(error=getattr(exc, "category", "provider_error"))
        return JSONResponse(
            status_code=status if 400 <= status < 600 else 502,
            content=body.model_dump(mode="json", exclude_none=True),
        )

    @app.exception_handler(AuthError)
    async def auth_error_handler(
        _request: Request,
        exc: AuthError,
    ) -> JSONResponse:
        body = AuthErrorResponse(error="auth_error", detail=str(exc))
        return JSONResponse(status_code=400, content=body.model_dump(mode="json"))

    return app


def run() -> None:
    """Run the API with uvicorn (``laliga-fantasy-builder-auth`` console script)."""
    import uvicorn

    uvicorn.run(
        "fantasy_auth.main:create_app",
        factory=True,
        host="0.0.0.0",
        port=8000,
        reload=False,
    )


def __getattr__(name: str) -> FastAPI:
    if name == "app":
        return create_app()
    raise AttributeError(name)
