"""Security headers, CORS, request-id, and redacted logging."""

from __future__ import annotations

import logging
import re
import time
import uuid
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from fantasy_auth.observability import current_trace_context

logger = logging.getLogger("fantasy_auth")


class ManualCallbackBodyLimitMiddleware:
    """Bound a pasted callback request before JSON parsing allocates its body."""

    def __init__(self, app: ASGIApp, max_bytes: int = 8192) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Buffer one small manual callback request or return a sanitized 413."""
        if scope["type"] != "http" or scope.get("path") != "/laliga/manual/complete":
            await self.app(scope, receive, send)
            return
        messages: list[Message] = []
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body = message.get("body", b"")
            size += len(body)
            if size > self.max_bytes:
                from starlette.responses import JSONResponse

                response = JSONResponse(
                    {"error": "request_too_large", "detail": "Callback request is too large"},
                    status_code=413,
                    headers={"Cache-Control": "no-store"},
                )
                await response(scope, receive, send)
                return
            messages.append(message)
            if not message.get("more_body", False):
                break

        async def replay() -> Message:
            """Supply the bounded request body to FastAPI exactly once."""
            if messages:
                return messages.pop(0)
            return {"type": "http.disconnect"}

        await self.app(scope, replay, send)


_REDACT_KEYS = re.compile(
    r"(authorization|access_token|id_token|refresh_token|code|secret|password|"
    r"client_secret|code_verifier)",
    re.IGNORECASE,
)


def redact_value(key: str, value: str) -> str:
    """Redact sensitive header/query values for logs.

    Args:
        key: Field name.
        value: Field value.

    Returns:
        Original value or ``[REDACTED]``.
    """
    if _REDACT_KEYS.search(key):
        return "[REDACTED]"
    return value


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach baseline security headers to every response."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable,
    ) -> Response:
        """Process the request and add security headers.

        Args:
            request: Incoming request.
            call_next: Next ASGI handler.

        Returns:
            Response with security headers.
        """
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        return response


class RedactedAccessLogMiddleware(BaseHTTPMiddleware):
    """Log method/path/status with OTEL correlation and without secrets."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable,
    ) -> Response:
        """Log a redacted access line.

        Args:
            request: Incoming request.
            call_next: Next ASGI handler.

        Returns:
            Downstream response.
        """
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        request_id = getattr(request.state, "request_id", "-")
        extra = {
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": duration_ms,
            **current_trace_context(),
        }
        logger.info(
            "request_id=%s method=%s path=%s status=%s duration_ms=%s",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            extra=extra,
        )
        return response


def install_cors(app: ASGIApp, origins: list[str]) -> None:
    """Install strict CORS middleware on a FastAPI application.

    Args:
        app: FastAPI application.
        origins: Exact-match allow-list.
    """
    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Request-Id"],
    )
