"""Central OpenTelemetry tracing and structured logging bootstrap."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

from fantasy_auth.config import Settings

_configured = False


class JsonFormatter(logging.Formatter):
    """Emit one JSON object per log line with optional OTEL correlation."""

    def format(self, record: logging.LogRecord) -> str:
        """Format a log record as JSON.

        Args:
            record: Log record.

        Returns:
            JSON string.
        """
        payload: dict[str, Any] = {
            "timestamp": datetime.now(tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in (
            "request_id",
            "trace_id",
            "span_id",
            "event",
            "detail",
            "method",
            "path",
            "status",
            "duration_ms",
        ):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(settings: Settings) -> None:
    """Configure root logging for the auth service.

    Args:
        settings: Application settings.
    """
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    if settings.log_json:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(levelname)s %(name)s %(message)s")
        )
    root.addHandler(handler)
    root.setLevel(settings.log_level.upper())


def configure_tracing(settings: Settings, app: Any | None = None) -> None:
    """Initialize OpenTelemetry tracing when an OTLP endpoint is configured.

    Args:
        settings: Application settings.
        app: Optional FastAPI application to instrument.
    """
    global _configured
    if _configured:
        return

    endpoint = settings.otel_exporter_otlp_endpoint
    if not endpoint:
        logging.getLogger("fantasy_auth.observability").info(
            "otel_disabled",
            extra={
                "event": "otel_disabled",
                "detail": "OTEL_EXPORTER_OTLP_ENDPOINT unset; tracing disabled",
            },
        )
        _configured = True
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logging.getLogger("fantasy_auth.observability").warning(
            "otel_packages_missing",
            extra={
                "event": "otel_packages_missing",
                "detail": "OpenTelemetry packages not installed",
            },
        )
        _configured = True
        return

    resource = Resource.create({"service.name": settings.otel_service_name})
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=endpoint)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    if app is not None:
        try:
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

            FastAPIInstrumentor.instrument_app(app)
        except Exception:
            logging.getLogger("fantasy_auth.observability").warning(
                "otel_fastapi_instrument_failed",
                extra={"event": "otel_fastapi_instrument_failed"},
                exc_info=True,
            )

    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        HTTPXClientInstrumentor().instrument()
    except Exception:
        pass

    try:
        from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor

        AsyncPGInstrumentor().instrument()
    except Exception:
        pass

    try:
        from opentelemetry.instrumentation.redis import RedisInstrumentor

        RedisInstrumentor().instrument()
    except Exception:
        pass

    _configured = True
    logging.getLogger("fantasy_auth.observability").info(
        "otel_configured",
        extra={"event": "otel_configured", "detail": endpoint},
    )


def current_trace_context() -> dict[str, str]:
    """Return current W3C trace/span IDs when available.

    Returns:
        Mapping with ``trace_id`` / ``span_id`` when a span is active.
    """
    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        context = span.get_span_context()
        if not context or not context.is_valid:
            return {}
        return {
            "trace_id": format(context.trace_id, "032x"),
            "span_id": format(context.span_id, "016x"),
        }
    except Exception:
        return {}


def get_tracer(name: str = "fantasy_auth"):
    """Return an OpenTelemetry tracer (no-op when OTEL is disabled).

    Args:
        name: Tracer instrumentation name.

    Returns:
        Tracer instance.
    """
    try:
        from opentelemetry import trace

        return trace.get_tracer(name)
    except Exception:
        return _NoopTracer()


class _NoopSpan:
    def __enter__(self) -> _NoopSpan:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def set_attribute(self, *_args: object, **_kwargs: object) -> None:
        return None


class _NoopTracer:
    def start_as_current_span(self, *_args: object, **_kwargs: object) -> _NoopSpan:
        return _NoopSpan()
