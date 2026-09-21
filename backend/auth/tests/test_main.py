# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import base64
import sys
from collections.abc import Iterator
from types import ModuleType, SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import fantasy_auth.main as main_mod
import pytest
from fantasy_auth.api.deps import AppContainer, set_container
from fantasy_auth.config import Settings
from fantasy_auth.domain.errors import (
    AuthError,
    NeedsReauth,
    OwnershipError,
    PairingError,
    ProviderError,
    ValidationError,
)
from fantasy_auth.main import (
    _create_runtime_resources,
    create_app,
    run,
)
from fantasy_auth.startup import StartupError
from fastapi.testclient import TestClient

VAULT_KEY = base64.b64encode(b"m" * 32).decode()


def _memory_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "use_memory_store": True,
        "cookie_secure": False,
        "token_vault_key_base64": VAULT_KEY,
        "log_json": False,
        "internal_service_token": "svc",
    }
    values.update(overrides)
    return Settings(**values)


@pytest.fixture
def memory_container() -> AppContainer:
    from fantasy_auth.api.deps import build_container

    return build_container(_memory_settings())


@pytest.fixture
def client(memory_container: AppContainer) -> Iterator[TestClient]:
    app = create_app(
        settings=memory_container.settings,
        container=memory_container,
    )
    set_container(memory_container)
    with TestClient(app) as test_client:
        yield test_client


# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_create_runtime_resources_memory_returns_none_none() -> None:
    # Arrange
    settings = _memory_settings()

    # Act
    pool, redis = await _create_runtime_resources(settings)

    # Assert
    assert pool is None
    assert redis is None


@pytest.mark.asyncio
async def test_create_runtime_resources_postgres_applies_migrations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    settings = _memory_settings(
        use_memory_store=False,
        database_url="postgresql://x",
        redis_url="redis://x",
        migration_auto_apply=True,
    )
    fake_asyncpg = ModuleType("asyncpg")
    fake_asyncpg.create_pool = AsyncMock(return_value="pool")  # type: ignore[attr-defined]
    fake_redis_mod = ModuleType("redis.asyncio")
    redis_client = MagicMock()
    redis_client.ping = AsyncMock()
    fake_redis_mod.Redis = SimpleNamespace(  # type: ignore[attr-defined]
        from_url=lambda *_a, **_k: redis_client
    )
    monkeypatch.setitem(sys.modules, "asyncpg", fake_asyncpg)
    monkeypatch.setitem(sys.modules, "redis.asyncio", fake_redis_mod)
    apply = AsyncMock()
    monkeypatch.setattr("fantasy_auth.migrate.apply_migrations", apply)

    # Act
    pool, redis = await _create_runtime_resources(settings)

    # Assert
    assert pool == "pool"
    assert redis is redis_client
    apply.assert_awaited_once_with("pool")


def test_lifespan_without_prebuilt_container_uses_memory_store() -> None:
    # Arrange
    app = create_app(settings=_memory_settings())

    # Act
    with TestClient(app) as client:
        response = client.get("/health/ready")

    # Assert
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "store": "memory"}


def test_health_ready_memory_path(client: TestClient) -> None:
    # Arrange / Act
    response = client.get("/health/ready")

    # Assert
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "store": "memory"}


def test_health_ready_postgres_path_ok(
    memory_container: AppContainer,
) -> None:
    # Arrange
    settings = _memory_settings(use_memory_store=False)
    conn = AsyncMock()
    conn.fetchval = AsyncMock(return_value=1)
    acquire_cm = MagicMock()
    acquire_cm.__aenter__ = AsyncMock(return_value=conn)
    acquire_cm.__aexit__ = AsyncMock(return_value=None)
    pool = MagicMock()
    pool.acquire.return_value = acquire_cm
    redis = MagicMock()
    redis.ping = AsyncMock(return_value=True)
    redis.aclose = AsyncMock()
    pool.close = AsyncMock()

    container = AppContainer(
        settings=settings,
        sessions=memory_container.sessions,
        pairings=memory_container.pairings,
        credentials=memory_container.credentials,
        internal_tokens=memory_container.internal_tokens,
        rate_limiter=memory_container.rate_limiter,
        clock=memory_container.clock,
        session_store=memory_container.session_store,
        refresh_lock=memory_container.refresh_lock,
        pg_pool=pool,
        redis=redis,
    )
    app = create_app(settings=settings, container=container)
    set_container(container)

    # Act
    with TestClient(app) as client:
        response = client.get("/health/ready")

    # Assert
    assert response.status_code == 200
    assert response.json()["store"] == "postgres+redis"


def test_run_patches_uvicorn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    called: dict[str, Any] = {}

    def fake_run(*args: Any, **kwargs: Any) -> None:
        called["args"] = args
        called["kwargs"] = kwargs

    fake_uvicorn = MagicMock()
    fake_uvicorn.run = fake_run
    monkeypatch.setitem(__import__("sys").modules, "uvicorn", fake_uvicorn)
    monkeypatch.setattr(
        "fantasy_auth.main.uvicorn",
        fake_uvicorn,
        raising=False,
    )

    # Patch import inside run()
    import builtins

    real_import = builtins.__import__

    def fake_import(name: str, *a: Any, **k: Any) -> Any:
        if name == "uvicorn":
            return fake_uvicorn
        return real_import(name, *a, **k)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    # Act
    run()

    # Assert
    assert called["kwargs"]["factory"] is True
    assert called["kwargs"]["port"] == 8000


def test_getattr_app_returns_fastapi(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    from fantasy_auth.api.deps import build_container

    container = build_container(_memory_settings())
    monkeypatch.setattr(
        main_mod,
        "create_app",
        lambda: create_app(settings=container.settings, container=container),
    )

    # Act
    app = main_mod.__getattr__("app")

    # Assert
    assert app.title


# ---- Error paths ---- #


def test_health_ready_postgres_failure_returns_503(
    memory_container: AppContainer,
) -> None:
    # Arrange
    settings = _memory_settings(use_memory_store=False)
    pool = MagicMock()
    pool.acquire.side_effect = RuntimeError("db down")
    redis = MagicMock()
    redis.aclose = AsyncMock()
    pool.close = AsyncMock()
    container = AppContainer(
        settings=settings,
        sessions=memory_container.sessions,
        pairings=memory_container.pairings,
        credentials=memory_container.credentials,
        internal_tokens=memory_container.internal_tokens,
        rate_limiter=memory_container.rate_limiter,
        clock=memory_container.clock,
        session_store=memory_container.session_store,
        refresh_lock=memory_container.refresh_lock,
        pg_pool=pool,
        redis=redis,
    )
    app = create_app(settings=settings, container=container)
    set_container(container)

    # Act
    with TestClient(app) as client:
        response = client.get("/health/ready")

    # Assert
    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"


def test_exception_handlers_map_domain_errors(
    client: TestClient,
) -> None:
    # Arrange — trigger handlers via dedicated routes
    app = client.app

    @app.get("/_test/ownership")
    async def ownership() -> None:
        raise OwnershipError("nope")

    @app.get("/_test/validation")
    async def validation() -> None:
        raise ValidationError("bad", category="jwt_invalid")

    @app.get("/_test/provider")
    async def provider() -> None:
        raise ProviderError("up", status_code=502, category="provider_error")

    @app.get("/_test/auth")
    async def auth() -> None:
        raise AuthError("generic")

    @app.get("/_test/startup")
    async def startup() -> None:
        raise StartupError("boot")

    @app.get("/_test/reauth")
    async def reauth() -> None:
        raise NeedsReauth("u-1")

    @app.get("/_test/pairing")
    async def pairing_limited() -> None:
        raise PairingError("slow", category="rate_limited")

    # Act / Assert
    assert client.get("/_test/ownership").status_code == 403
    assert client.get("/_test/validation").json()["error"] == "jwt_invalid"
    assert client.get("/_test/provider").status_code == 502
    assert client.get("/_test/auth").json()["error"] == "auth_error"
    assert client.get("/_test/startup").status_code == 503
    assert client.get("/_test/reauth").json()["error"] == "needs_reauth"
    assert client.get("/_test/pairing").status_code == 429


# ---- Edge cases ---- #


def test_getattr_unknown_raises_attribute_error() -> None:
    # Arrange / Act / Assert
    with pytest.raises(AttributeError):
        main_mod.__getattr__("nope")
