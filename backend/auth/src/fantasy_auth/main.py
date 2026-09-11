"""FastAPI factory for the LaLiga Fantasy Builder auth module entrypoint."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from fantasy_auth.api import auth, pairings
from fantasy_auth.api.deps import AppContainer, build_container, set_container
from fantasy_auth.api.middleware import (
    RedactedAccessLogMiddleware,
    SecurityHeadersMiddleware,
    install_cors,
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
    app_container = container or build_container(cfg)
    set_container(app_container)

    app = FastAPI(title=cfg.app_name, version="0.1.0")
    install_cors(app, cfg.cors_origins)
    app.add_middleware(RedactedAccessLogMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)

    app.include_router(auth.router)
    app.include_router(pairings.router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.exception_handler(SessionError)
    async def session_error_handler(
        _request: Request,
        exc: SessionError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content={"error": "unauthorized", "detail": str(exc)},
        )

    @app.exception_handler(OwnershipError)
    async def ownership_error_handler(
        _request: Request,
        exc: OwnershipError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=403,
            content={"error": "forbidden", "detail": str(exc)},
        )

    @app.exception_handler(PairingError)
    async def pairing_error_handler(
        _request: Request,
        exc: PairingError,
    ) -> JSONResponse:
        status = 429 if exc.category == "rate_limited" else 400
        return JSONResponse(
            status_code=status,
            content={"error": exc.category, "detail": str(exc)},
        )

    @app.exception_handler(NeedsReauth)
    async def needs_reauth_handler(
        _request: Request,
        exc: NeedsReauth,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content={"error": "needs_reauth", "detail": str(exc)},
        )

    @app.exception_handler(ValidationError)
    async def validation_error_handler(
        _request: Request,
        exc: ValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={"error": exc.category, "detail": str(exc)},
        )

    @app.exception_handler(ProviderError)
    async def provider_error_handler(
        _request: Request,
        exc: ProviderError,
    ) -> JSONResponse:
        status = exc.status_code or 502
        # Never leak upstream payloads — category only.
        return JSONResponse(
            status_code=status if 400 <= status < 600 else 502,
            content={"error": exc.category},
        )

    @app.exception_handler(AuthError)
    async def auth_error_handler(
        _request: Request,
        exc: AuthError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={"error": "auth_error", "detail": str(exc)},
        )

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


# Module-level app for ``uvicorn fantasy_auth.main:app``.
# Built lazily via factory in ``run()``; attribute set for ASGI servers.
def __getattr__(name: str) -> FastAPI:
    if name == "app":
        return create_app()
    raise AttributeError(name)
