# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import base64
from dataclasses import replace
from typing import Any

import pytest
from fantasy_auth.adapters.internal_jwt import generate_dev_rsa_keypair
from fantasy_auth.api import deps
from fantasy_auth.config import Settings
from fantasy_auth.domain.errors import SessionError, ValidationError
from fantasy_auth.domain.users import AppUser
from starlette.requests import Request

VAULT_KEY = base64.b64encode(b"v" * 32).decode()


def _memory_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "use_memory_store": True,
        "cookie_secure": False,
        "token_vault_key_base64": VAULT_KEY,
        "log_json": False,
        "internal_service_token": "svc-token",
    }
    values.update(overrides)
    return Settings(**values)


def _prod_settings(**overrides: Any) -> Settings:
    priv, pub = generate_dev_rsa_keypair()
    values: dict[str, Any] = {
        "use_memory_store": False,
        "cookie_secure": True,
        "token_vault_key_base64": VAULT_KEY,
        "database_url": "postgresql://u:p@localhost/db",
        "redis_url": "redis://localhost:6379/0",
        "app_oidc_jwks_url": "https://idp/jwks",
        "internal_jwt_private_key_pem": priv,
        "internal_jwt_public_key_pem": pub,
        "internal_service_token": "svc-token",
        "log_json": False,
    }
    values.update(overrides)
    return Settings(**values)


def _request(
    *,
    cookies: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
) -> Request:
    header_list: list[tuple[bytes, bytes]] = []
    if cookies:
        cookie = "; ".join(f"{k}={v}" for k, v in cookies.items())
        header_list.append((b"cookie", cookie.encode()))
    for key, value in (headers or {}).items():
        header_list.append((key.lower().encode(), value.encode()))
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": header_list,
        "client": ("127.0.0.1", 123),
        "server": ("test", 80),
    }
    return Request(scope)


# ---- Happy path ---- #


def test_build_container_memory_store_wires_services() -> None:
    # Arrange
    settings = _memory_settings()

    # Act
    container = deps.build_container(settings)

    # Assert
    assert container.settings is settings
    assert container.pg_pool is None
    assert container.redis is None
    assert container.sessions is not None
    assert container.pairings is not None
    assert container.credentials is not None


def test_build_container_production_with_fake_pool_redis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    settings = _prod_settings()
    fake_pool = object()
    fake_redis = object()

    class FakeStore:
        def __init__(self, pool: Any) -> None:
            self.pool = pool

    class FakeRedisAdapter:
        def __init__(self, redis: Any) -> None:
            self.redis = redis

    monkeypatch.setattr(
        "fantasy_auth.adapters.postgres.PostgresSessionStore",
        FakeStore,
    )
    monkeypatch.setattr(
        "fantasy_auth.adapters.postgres.PostgresPairingStore",
        FakeStore,
    )
    monkeypatch.setattr(
        "fantasy_auth.adapters.postgres.PostgresConnectionRepo",
        FakeStore,
    )
    monkeypatch.setattr(
        "fantasy_auth.adapters.redis.RedisRateLimiter",
        FakeRedisAdapter,
    )
    monkeypatch.setattr(
        "fantasy_auth.adapters.redis.RedisRefreshLock",
        FakeRedisAdapter,
    )

    # Act
    container = deps.build_container(settings, pg_pool=fake_pool, redis=fake_redis)

    # Assert
    assert container.pg_pool is fake_pool
    assert container.redis is fake_redis


def test_build_internal_jwt_empty_pem_generates_keys() -> None:
    # Arrange
    settings = _memory_settings(
        internal_jwt_private_key_pem="",
        internal_jwt_public_key_pem="",
    )

    # Act
    adapter = deps._build_internal_jwt(settings)

    # Assert
    assert adapter is not None
    assert adapter._private_key is not None


@pytest.mark.asyncio
async def test_require_internal_user_valid_returns_user() -> None:
    # Arrange
    settings = _memory_settings()
    container = deps.build_container(settings)
    deps.set_container(container)
    user = AppUser(user_id="u-1", email="a@b.c", name="A")
    issued = container.internal_tokens.issue_for_user(user)

    # Act
    resolved = await deps.require_internal_user(f"Bearer {issued.access_token}")

    # Assert
    assert resolved.user_id == "u-1"


# ---- Error paths ---- #


def test_build_container_production_without_pool_raises() -> None:
    # Arrange
    settings = _prod_settings()

    # Act / Assert
    with pytest.raises(RuntimeError, match="requires pg_pool and redis"):
        deps.build_container(settings)


@pytest.mark.asyncio
async def test_get_current_user_missing_cookie_raises() -> None:
    # Arrange
    settings = _memory_settings()
    deps.set_container(deps.build_container(settings))
    request = _request()

    # Act / Assert
    with pytest.raises(SessionError):
        await deps.get_current_user(request, fantasy_session=None)


@pytest.mark.asyncio
async def test_require_csrf_mismatched_raises() -> None:
    # Arrange
    settings = _memory_settings()
    container = deps.build_container(settings)
    deps.set_container(container)
    start = await container.sessions.start_login()
    session = await container.session_store.get(start.session_id)
    assert session is not None
    bound = replace(
        session,
        user=AppUser(user_id="u-1"),
        oidc_state=None,
        oidc_nonce=None,
        oidc_code_verifier=None,
    )
    await container.session_store.save(bound)
    request = _request(
        cookies={
            "fantasy_session": bound.session_id,
            "fantasy_csrf": bound.csrf_token,
        },
        headers={"origin": "http://localhost:3000"},
    )

    # Act / Assert
    with pytest.raises(SessionError, match="csrf failed"):
        await deps.require_csrf(request, x_csrf_token="wrong-token")


def test_require_service_token_empty_raises() -> None:
    # Arrange
    settings = _memory_settings(internal_service_token="")
    deps.set_container(deps.build_container(settings))

    # Act / Assert
    with pytest.raises(SessionError, match="not configured"):
        deps.require_service_token("anything")


def test_require_service_token_bad_raises() -> None:
    # Arrange
    settings = _memory_settings()
    deps.set_container(deps.build_container(settings))

    # Act / Assert
    with pytest.raises(SessionError, match="invalid service token"):
        deps.require_service_token("wrong")


@pytest.mark.asyncio
async def test_require_internal_user_missing_bearer_raises() -> None:
    # Arrange
    settings = _memory_settings()
    deps.set_container(deps.build_container(settings))

    # Act / Assert
    with pytest.raises(SessionError, match="missing bearer"):
        await deps.require_internal_user(None)
    with pytest.raises(SessionError, match="missing bearer"):
        await deps.require_internal_user("Bearer ")


@pytest.mark.asyncio
async def test_require_internal_user_invalid_jwt_raises() -> None:
    # Arrange
    settings = _memory_settings()
    deps.set_container(deps.build_container(settings))

    # Act / Assert
    with pytest.raises(ValidationError):
        await deps.require_internal_user("Bearer not-a-jwt")


# ---- Edge cases ---- #


def test_get_settings_dep_returns_settings() -> None:
    # Arrange
    settings = _memory_settings()
    deps.set_container(deps.build_container(settings))

    # Act / Assert
    assert deps.get_settings_dep().use_memory_store is True


def test_require_service_token_valid_passes() -> None:
    # Arrange
    settings = _memory_settings()
    deps.set_container(deps.build_container(settings))

    # Act / Assert
    deps.require_service_token("svc-token")
