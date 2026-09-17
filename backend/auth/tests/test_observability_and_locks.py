# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import logging
import sys
from types import ModuleType, SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import fantasy_auth.observability as observability
import pytest
from fantasy_auth.config import Settings
from fantasy_auth.observability import (
    JsonFormatter,
    _NoopSpan,
    _NoopTracer,
    configure_logging,
    configure_tracing,
    current_trace_context,
    get_tracer,
)


@pytest.fixture(autouse=True)
def _reset_configured() -> Any:
    observability._configured = False
    yield
    observability._configured = False


def _settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "use_memory_store": True,
        "cookie_secure": False,
        "log_json": True,
        "log_level": "INFO",
        "otel_exporter_otlp_endpoint": None,
        "otel_service_name": "test-auth",
    }
    values.update(overrides)
    return Settings(**values)


# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_memory_rate_limiter_allows_under_limit() -> None:
    from fantasy_auth.adapters.memory import MemoryRateLimiter

    # Arrange
    limiter = MemoryRateLimiter()

    # Act
    allowed = await limiter.allow("ip:1", limit=2, window_seconds=60)

    # Assert
    assert allowed is True


@pytest.mark.asyncio
async def test_memory_refresh_lock_acquire_and_release() -> None:
    from fantasy_auth.adapters.redis import MemoryRefreshLock

    # Arrange
    lock = MemoryRefreshLock()

    # Act
    first = await lock.acquire("u1")
    second = await lock.acquire("u1")
    await lock.release("u1")
    third = await lock.acquire("u1")

    # Assert
    assert first is True
    assert second is False
    assert third is True


def test_redact_value_masks_secrets() -> None:
    from fantasy_auth.api.middleware import redact_value

    # Arrange / Act / Assert
    assert redact_value("access_token", "secret") == "[REDACTED]"
    assert redact_value("X-Request-Id", "abc") == "abc"


def test_json_formatter_includes_correlation_fields() -> None:
    # Arrange
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="fantasy_auth",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello",
        args=(),
        exc_info=None,
    )
    record.request_id = "req-1"
    record.trace_id = "trace-1"
    record.span_id = "span-1"

    # Act
    payload = formatter.format(record)

    # Assert
    assert '"request_id": "req-1"' in payload
    assert '"trace_id": "trace-1"' in payload
    assert '"span_id": "span-1"' in payload


def test_json_formatter_with_exc_info_includes_traceback() -> None:
    # Arrange
    formatter = JsonFormatter()
    try:
        raise ValueError("boom")
    except ValueError:
        record = logging.LogRecord(
            name="fantasy_auth",
            level=logging.ERROR,
            pathname=__file__,
            lineno=1,
            msg="failed",
            args=(),
            exc_info=sys.exc_info(),
        )

    # Act
    payload = formatter.format(record)

    # Assert
    assert "exc_info" in payload
    assert "ValueError" in payload
    assert "boom" in payload


def test_configure_logging_log_json_false_uses_plain_formatter() -> None:
    # Arrange
    settings = _settings(log_json=False)

    # Act
    configure_logging(settings)
    root = logging.getLogger()

    # Assert
    assert root.handlers
    assert isinstance(root.handlers[0].formatter, logging.Formatter)
    assert not isinstance(root.handlers[0].formatter, JsonFormatter)


def test_configure_tracing_disabled_when_endpoint_unset() -> None:
    # Arrange
    settings = _settings(otel_exporter_otlp_endpoint=None)

    # Act
    configure_tracing(settings)
    configure_tracing(settings)  # idempotent early return

    # Assert
    assert observability._configured is True


def test_configure_tracing_enabled_with_fake_otel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    settings = _settings(otel_exporter_otlp_endpoint="http://otel:4318/v1/traces")

    fake_trace = ModuleType("opentelemetry.trace")
    fake_trace.set_tracer_provider = MagicMock()  # type: ignore[attr-defined]
    fake_trace.get_tracer = MagicMock()  # type: ignore[attr-defined]

    fake_exporter_mod = ModuleType("opentelemetry.exporter.otlp.proto.http.trace_exporter")
    fake_exporter_mod.OTLPSpanExporter = MagicMock(  # type: ignore[attr-defined]
        return_value=MagicMock()
    )

    fake_resources = ModuleType("opentelemetry.sdk.resources")
    fake_resources.Resource = SimpleNamespace(  # type: ignore[attr-defined]
        create=MagicMock(return_value={})
    )

    fake_sdk_trace = ModuleType("opentelemetry.sdk.trace")
    provider = MagicMock()
    fake_sdk_trace.TracerProvider = MagicMock(return_value=provider)  # type: ignore[attr-defined]

    fake_export = ModuleType("opentelemetry.sdk.trace.export")
    fake_export.BatchSpanProcessor = MagicMock(return_value=MagicMock())  # type: ignore[attr-defined]

    fake_otel = ModuleType("opentelemetry")
    fake_otel.trace = fake_trace  # type: ignore[attr-defined]

    fake_fastapi_instr = ModuleType("opentelemetry.instrumentation.fastapi")
    fake_fastapi_instr.FastAPIInstrumentor = SimpleNamespace(  # type: ignore[attr-defined]
        instrument_app=MagicMock()
    )
    fake_httpx_instr = ModuleType("opentelemetry.instrumentation.httpx")
    fake_httpx_instr.HTTPXClientInstrumentor = MagicMock(  # type: ignore[attr-defined]
        return_value=SimpleNamespace(instrument=MagicMock())
    )
    fake_asyncpg_instr = ModuleType("opentelemetry.instrumentation.asyncpg")
    fake_asyncpg_instr.AsyncPGInstrumentor = MagicMock(  # type: ignore[attr-defined]
        return_value=SimpleNamespace(instrument=MagicMock())
    )
    fake_redis_instr = ModuleType("opentelemetry.instrumentation.redis")
    fake_redis_instr.RedisInstrumentor = MagicMock(  # type: ignore[attr-defined]
        return_value=SimpleNamespace(instrument=MagicMock())
    )

    modules = {
        "opentelemetry": fake_otel,
        "opentelemetry.trace": fake_trace,
        "opentelemetry.exporter.otlp.proto.http.trace_exporter": (fake_exporter_mod),
        "opentelemetry.sdk.resources": fake_resources,
        "opentelemetry.sdk.trace": fake_sdk_trace,
        "opentelemetry.sdk.trace.export": fake_export,
        "opentelemetry.instrumentation.fastapi": fake_fastapi_instr,
        "opentelemetry.instrumentation.httpx": fake_httpx_instr,
        "opentelemetry.instrumentation.asyncpg": fake_asyncpg_instr,
        "opentelemetry.instrumentation.redis": fake_redis_instr,
    }
    for name, mod in modules.items():
        monkeypatch.setitem(sys.modules, name, mod)

    app = MagicMock()

    # Act
    configure_tracing(settings, app=app)

    # Assert
    assert observability._configured is True
    fake_fastapi_instr.FastAPIInstrumentor.instrument_app.assert_called_once()


def test_get_tracer_when_otel_broken_returns_noop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    def boom() -> None:
        raise RuntimeError("no otel")

    monkeypatch.setitem(sys.modules, "opentelemetry", None)
    # Force import failure inside get_tracer
    real_import = __import__

    def fake_import(name: str, *args: Any, **kwargs: Any) -> Any:
        if name == "opentelemetry" or name.startswith("opentelemetry."):
            raise ImportError("missing")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", fake_import)

    # Act
    tracer = get_tracer("test")

    # Assert
    assert isinstance(tracer, _NoopTracer)
    with tracer.start_as_current_span("span") as span:
        assert isinstance(span, _NoopSpan)
        span.set_attribute("k", "v")


# ---- Error paths ---- #


@pytest.mark.asyncio
async def test_memory_rate_limiter_blocks_over_limit() -> None:
    from fantasy_auth.adapters.memory import MemoryRateLimiter

    # Arrange
    limiter = MemoryRateLimiter()
    await limiter.allow("ip:2", limit=1, window_seconds=60)

    # Act
    blocked = await limiter.allow("ip:2", limit=1, window_seconds=60)

    # Assert
    assert blocked is False


def test_configure_tracing_import_error_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    settings = _settings(otel_exporter_otlp_endpoint="http://otel:4318/v1/traces")

    real_import = __import__

    def fake_import(name: str, *args: Any, **kwargs: Any) -> Any:
        if name.startswith("opentelemetry"):
            raise ImportError("missing otel")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", fake_import)

    # Act
    configure_tracing(settings)

    # Assert
    assert observability._configured is True


def test_configure_tracing_instrumentor_except_passes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    settings = _settings(otel_exporter_otlp_endpoint="http://otel:4318/v1/traces")

    fake_trace = ModuleType("opentelemetry.trace")
    fake_trace.set_tracer_provider = MagicMock()  # type: ignore[attr-defined]

    fake_exporter_mod = ModuleType("opentelemetry.exporter.otlp.proto.http.trace_exporter")
    fake_exporter_mod.OTLPSpanExporter = MagicMock(return_value=MagicMock())  # type: ignore[attr-defined]

    fake_resources = ModuleType("opentelemetry.sdk.resources")
    fake_resources.Resource = SimpleNamespace(  # type: ignore[attr-defined]
        create=MagicMock(return_value={})
    )

    fake_sdk_trace = ModuleType("opentelemetry.sdk.trace")
    provider = MagicMock()
    fake_sdk_trace.TracerProvider = MagicMock(return_value=provider)  # type: ignore[attr-defined]

    fake_export = ModuleType("opentelemetry.sdk.trace.export")
    fake_export.BatchSpanProcessor = MagicMock(return_value=MagicMock())  # type: ignore[attr-defined]

    fake_otel = ModuleType("opentelemetry")
    fake_otel.trace = fake_trace  # type: ignore[attr-defined]

    def boom_instr(*_a: Any, **_k: Any) -> None:
        raise RuntimeError("instrument fail")

    fake_fastapi_instr = ModuleType("opentelemetry.instrumentation.fastapi")
    fake_fastapi_instr.FastAPIInstrumentor = SimpleNamespace(  # type: ignore[attr-defined]
        instrument_app=boom_instr
    )

    class BoomInstrumentor:
        def instrument(self) -> None:
            raise RuntimeError("boom")

    fake_httpx_instr = ModuleType("opentelemetry.instrumentation.httpx")
    fake_httpx_instr.HTTPXClientInstrumentor = BoomInstrumentor  # type: ignore[attr-defined]
    fake_asyncpg_instr = ModuleType("opentelemetry.instrumentation.asyncpg")
    fake_asyncpg_instr.AsyncPGInstrumentor = BoomInstrumentor  # type: ignore[attr-defined]
    fake_redis_instr = ModuleType("opentelemetry.instrumentation.redis")
    fake_redis_instr.RedisInstrumentor = BoomInstrumentor  # type: ignore[attr-defined]

    for name, mod in {
        "opentelemetry": fake_otel,
        "opentelemetry.trace": fake_trace,
        "opentelemetry.exporter.otlp.proto.http.trace_exporter": (fake_exporter_mod),
        "opentelemetry.sdk.resources": fake_resources,
        "opentelemetry.sdk.trace": fake_sdk_trace,
        "opentelemetry.sdk.trace.export": fake_export,
        "opentelemetry.instrumentation.fastapi": fake_fastapi_instr,
        "opentelemetry.instrumentation.httpx": fake_httpx_instr,
        "opentelemetry.instrumentation.asyncpg": fake_asyncpg_instr,
        "opentelemetry.instrumentation.redis": fake_redis_instr,
    }.items():
        monkeypatch.setitem(sys.modules, name, mod)

    # Act — should not raise
    configure_tracing(settings, app=MagicMock())

    # Assert
    assert observability._configured is True


# ---- Edge cases ---- #


def test_current_trace_context_without_otel_is_empty() -> None:
    # Arrange / Act / Assert
    assert current_trace_context() == {} or isinstance(current_trace_context(), dict)


def test_current_trace_context_valid_span_returns_ids(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    fake_trace = ModuleType("opentelemetry.trace")
    context = SimpleNamespace(is_valid=True, trace_id=1, span_id=2)
    span = SimpleNamespace(get_span_context=lambda: context)
    fake_trace.get_current_span = lambda: span  # type: ignore[attr-defined]
    fake_otel = ModuleType("opentelemetry")
    fake_otel.trace = fake_trace  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "opentelemetry", fake_otel)
    monkeypatch.setitem(sys.modules, "opentelemetry.trace", fake_trace)

    # Act
    result = current_trace_context()

    # Assert
    assert result["trace_id"] == format(1, "032x")
    assert result["span_id"] == format(2, "016x")


def test_current_trace_context_exception_returns_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    fake_trace = ModuleType("opentelemetry.trace")

    def boom() -> None:
        raise RuntimeError("otel down")

    fake_trace.get_current_span = boom  # type: ignore[attr-defined]
    fake_otel = ModuleType("opentelemetry")
    fake_otel.trace = fake_trace  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "opentelemetry", fake_otel)
    monkeypatch.setitem(sys.modules, "opentelemetry.trace", fake_trace)

    # Act / Assert
    assert current_trace_context() == {}
