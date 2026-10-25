"""Dependency injection container and FastAPI dependencies."""

from __future__ import annotations

import asyncio
import secrets
from dataclasses import dataclass
from typing import Any

from fastapi import Request

from fantasy_auth.adapters.b2c_httpx import HttpxB2CClient
from fantasy_auth.adapters.fantasy_httpx import HttpxFantasyClient
from fantasy_auth.adapters.identity_jwt import IdentityJwtValidator
from fantasy_auth.adapters.jwks import B2CJwksValidator
from fantasy_auth.adapters.memory import (
    MemoryBrowserPairingStore,
    MemoryConnectionRepo,
    MemoryPairingStore,
    MemoryRateLimiter,
    SystemClock,
)
from fantasy_auth.adapters.redis import MemoryRefreshLock
from fantasy_auth.adapters.vault_aesgcm import AesGcmTokenVault
from fantasy_auth.application.credentials import CredentialProvider
from fantasy_auth.application.pairing import PairingService
from fantasy_auth.config import Settings, get_settings
from fantasy_auth.domain.errors import SessionError, ValidationError
from fantasy_auth.domain.users import AppUser, extract_app_user_from_claims
from fantasy_auth.ports.internal_tokens import InternalTokenValidator
from fantasy_auth.ports.repos import (
    BrowserPairingStore,
    Clock,
    ConnectionRepo,
    PairingStore,
    RateLimiter,
    RefreshLock,
)
from fantasy_auth.startup import (
    resolve_vault_key,
    validate_settings,
)


@dataclass
class AppContainer:
    """Process-lifetime LaLiga services and external identity verification."""

    settings: Settings
    pairings: PairingService
    credentials: CredentialProvider
    jwt_validator: InternalTokenValidator
    rate_limiter: RateLimiter
    clock: Clock
    browser_pairings: BrowserPairingStore
    refresh_lock: RefreshLock
    pg_pool: Any | None = None
    redis: Any | None = None


_container: AppContainer | None = None


def build_container(
    settings: Settings | None = None,
    *,
    pg_pool: Any | None = None,
    redis: Any | None = None,
    browser_pairings: BrowserPairingStore | None = None,
    pairing_store: PairingStore | None = None,
    connection_repo: ConnectionRepo | None = None,
    rate_limiter: RateLimiter | None = None,
    refresh_lock: RefreshLock | None = None,
    jwt_validator: InternalTokenValidator | None = None,
) -> AppContainer:
    """Build LaLiga services, stores, and Better Auth token verification."""
    cfg = settings or get_settings()
    validate_settings(cfg)
    clock = SystemClock()

    vault_key, _ = resolve_vault_key(cfg)
    vault = AesGcmTokenVault.from_base64(vault_key)

    if cfg.use_memory_store:
        resolved_browser = browser_pairings or MemoryBrowserPairingStore()
        resolved_pairings = pairing_store or MemoryPairingStore()
        resolved_connections = connection_repo or MemoryConnectionRepo()
        resolved_rate_limiter = rate_limiter or MemoryRateLimiter()
        resolved_refresh_lock = refresh_lock or MemoryRefreshLock()
    else:
        if pg_pool is None or redis is None:
            raise RuntimeError("production mode requires pg_pool and redis")
        from fantasy_auth.adapters.postgres import (
            PostgresBrowserPairingStore,
            PostgresConnectionRepo,
            PostgresPairingStore,
            PostgresRefreshLock,
        )
        from fantasy_auth.adapters.redis import RedisRateLimiter

        resolved_browser = browser_pairings or PostgresBrowserPairingStore(pg_pool)
        resolved_pairings = pairing_store or PostgresPairingStore(pg_pool)
        resolved_connections = connection_repo or PostgresConnectionRepo(pg_pool)
        resolved_rate_limiter = rate_limiter or RedisRateLimiter(redis)
        resolved_refresh_lock = refresh_lock or PostgresRefreshLock(pg_pool)

    b2c = HttpxB2CClient(
        client_id=cfg.laliga_client_id,
        signin_policy=cfg.laliga_signin_policy,
        token_base_url=cfg.laliga_base_url,
        authorize_url=cfg.laliga_authorize_url,
        allow_id_token_fallback=cfg.laliga_allow_id_token_fallback,
        clock_now=clock.now,
    )
    jwks = B2CJwksValidator(
        discovery_base=cfg.laliga_discovery_base,
        issuer=cfg.laliga_issuer,
    )
    fantasy = HttpxFantasyClient(origin=cfg.laliga_fantasy_origin)
    resolved_validator = jwt_validator or IdentityJwtValidator(
        jwks_url=cfg.auth_jwks_url,
        issuer=cfg.internal_jwt_issuer,
        audience=cfg.internal_jwt_audience,
    )

    pairings = PairingService(
        pairings=resolved_pairings,
        connections=resolved_connections,
        vault=vault,
        jwks=jwks,
        fantasy=fantasy,
        clock=clock,
        client_id=cfg.laliga_client_id,
        policy=cfg.laliga_signin_policy,
        pairing_ttl_seconds=cfg.pairing_ttl_seconds,
        allow_id_token_fallback=cfg.laliga_allow_id_token_fallback,
        b2c=b2c,
        redirect_uri=cfg.laliga_redirect_uri,
        operation_lock=resolved_refresh_lock,
    )
    credentials = CredentialProvider(
        connections=resolved_connections,
        vault=vault,
        b2c=b2c,
        clock=clock,
        refresh_skew_seconds=cfg.refresh_skew_seconds,
        allow_id_token_fallback=cfg.laliga_allow_id_token_fallback,
        refresh_lock=resolved_refresh_lock,
    )
    return AppContainer(
        settings=cfg,
        pairings=pairings,
        credentials=credentials,
        jwt_validator=resolved_validator,
        rate_limiter=resolved_rate_limiter,
        clock=clock,
        browser_pairings=resolved_browser,
        refresh_lock=resolved_refresh_lock,
        pg_pool=pg_pool,
        redis=redis,
    )


def set_container(container: AppContainer) -> None:
    """Replace the process-global container (used by tests).

    Args:
        container: Container to install.
    """
    global _container
    _container = container


def get_container() -> AppContainer:
    """Return the process-global container, building it lazily.

    Returns:
        Application container.
    """
    global _container
    if _container is None:
        _container = build_container()
    return _container


def get_settings_dep() -> Settings:
    """FastAPI dependency for settings.

    Returns:
        Settings singleton.
    """
    return get_container().settings


async def get_current_user(request: Request) -> AppUser:
    """Resolve only a verified Better Auth Bearer token; cookies confer no access."""
    return await require_internal_user(request.headers.get("authorization"))


def require_service_token(x_service_token: str | None) -> None:
    """Require the shared service credential for ``/internal/*`` routes.

    Args:
        x_service_token: Value of the ``X-Service-Token`` header.

    Raises:
        SessionError: When the token is missing or mismatched.
    """
    expected = get_container().settings.internal_service_token
    if not expected:
        raise SessionError("service token not configured")
    if not x_service_token or not secrets.compare_digest(x_service_token, expected):
        raise SessionError("invalid service token")


async def require_internal_user(authorization: str | None) -> AppUser:
    """Resolve the app user from an internal Bearer JWT.

    Args:
        authorization: ``Authorization`` header value.

    Returns:
        Application user from verified JWT claims.

    Raises:
        SessionError: When the header is missing or malformed.
        ValidationError: When JWT validation fails.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise SessionError("missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise SessionError("missing bearer token")
    try:
        claims = await asyncio.to_thread(get_container().jwt_validator.validate, token)
        return extract_app_user_from_claims(claims)
    except (ValidationError, ValueError) as exc:
        raise SessionError("invalid application token") from exc
