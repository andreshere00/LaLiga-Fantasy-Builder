"""Dependency injection container and FastAPI dependencies."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Cookie, Header, Request

from fantasy_auth.adapters.b2c_httpx import HttpxB2CClient
from fantasy_auth.adapters.fantasy_httpx import HttpxFantasyClient
from fantasy_auth.adapters.internal_jwt import Rs256InternalJwt, generate_dev_rsa_keypair
from fantasy_auth.adapters.jwks import AppOidcJwksValidator, B2CJwksValidator
from fantasy_auth.adapters.memory import (
    MemoryConnectionRepo,
    MemoryPairingStore,
    MemoryRateLimiter,
    MemorySessionStore,
    SystemClock,
)
from fantasy_auth.adapters.redis import MemoryRefreshLock
from fantasy_auth.adapters.vault_aesgcm import AesGcmTokenVault
from fantasy_auth.application.credentials import CredentialProvider
from fantasy_auth.application.internal_tokens import InternalTokenService
from fantasy_auth.application.pairing import PairingService
from fantasy_auth.application.sessions import SessionService
from fantasy_auth.config import Settings, get_settings
from fantasy_auth.domain.errors import SessionError, ValidationError
from fantasy_auth.domain.users import AppUser
from fantasy_auth.ports.repos import (
    Clock,
    ConnectionRepo,
    PairingStore,
    RateLimiter,
    RefreshLock,
    SessionRecord,
    SessionStore,
)
from fantasy_auth.startup import (
    log_vault_key_status,
    resolve_vault_key,
    validate_settings,
)


@dataclass
class AppContainer:
    """Wired application services for the process lifetime.

    Attributes:
        settings: Loaded settings.
        sessions: Session use cases.
        pairings: Pairing use cases.
        credentials: Credential provider.
        internal_tokens: Internal JWT issuer/validator.
        rate_limiter: Rate limiter for pairing complete.
        clock: Clock implementation.
        session_store: Underlying session store (for cookie TTL).
        refresh_lock: Refresh singleflight lock.
        pg_pool: Optional asyncpg pool (production).
        redis: Optional Redis client (production).
    """

    settings: Settings
    sessions: SessionService
    pairings: PairingService
    credentials: CredentialProvider
    internal_tokens: InternalTokenService
    rate_limiter: RateLimiter
    clock: Clock
    session_store: SessionStore
    refresh_lock: RefreshLock
    pg_pool: Any | None = None
    redis: Any | None = None


_container: AppContainer | None = None


def _build_internal_jwt(cfg: Settings) -> Rs256InternalJwt:
    """Build the internal JWT adapter, generating a dev keypair when unset.

    Args:
        cfg: Application settings.

    Returns:
        Configured RS256 adapter.
    """
    private_pem = cfg.internal_jwt_private_key_pem
    public_pem = cfg.internal_jwt_public_key_pem
    if not private_pem or not public_pem:
        private_pem, public_pem = generate_dev_rsa_keypair()
    return Rs256InternalJwt(
        private_key_pem=private_pem,
        public_key_pem=public_pem,
        issuer=cfg.internal_jwt_issuer,
        audience=cfg.internal_jwt_audience,
        ttl_seconds=cfg.internal_jwt_ttl_seconds,
    )


def build_container(
    settings: Settings | None = None,
    *,
    pg_pool: Any | None = None,
    redis: Any | None = None,
    session_store: SessionStore | None = None,
    pairing_store: PairingStore | None = None,
    connection_repo: ConnectionRepo | None = None,
    rate_limiter: RateLimiter | None = None,
    refresh_lock: RefreshLock | None = None,
    oidc_validator: Any | None = None,
    internal_jwt: Rs256InternalJwt | None = None,
) -> AppContainer:
    """Build a fully wired container.

    Args:
        settings: Optional settings override.
        pg_pool: Optional Postgres pool for production adapters.
        redis: Optional Redis client for production adapters.
        session_store: Optional session store override (tests).
        pairing_store: Optional pairing store override (tests).
        connection_repo: Optional connection repo override (tests).
        rate_limiter: Optional rate limiter override (tests).
        refresh_lock: Optional refresh lock override (tests).
        oidc_validator: Optional app OIDC validator override (tests).
        internal_jwt: Optional internal JWT adapter override (tests).

    Returns:
        Application container.
    """
    cfg = settings or get_settings()
    validate_settings(cfg)
    clock = SystemClock()

    vault_key, used_dev_fallback = resolve_vault_key(cfg)
    log_vault_key_status(used_dev_fallback=used_dev_fallback)
    vault = AesGcmTokenVault.from_base64(vault_key)

    if cfg.use_memory_store:
        resolved_sessions = session_store or MemorySessionStore()
        resolved_pairings = pairing_store or MemoryPairingStore()
        resolved_connections = connection_repo or MemoryConnectionRepo()
        resolved_rate_limiter = rate_limiter or MemoryRateLimiter()
        resolved_refresh_lock = refresh_lock or MemoryRefreshLock()
    else:
        if pg_pool is None or redis is None:
            raise RuntimeError("production mode requires pg_pool and redis")
        from fantasy_auth.adapters.postgres import (
            PostgresConnectionRepo,
            PostgresPairingStore,
            PostgresSessionStore,
        )
        from fantasy_auth.adapters.redis import RedisRateLimiter, RedisRefreshLock

        resolved_sessions = session_store or PostgresSessionStore(pg_pool)
        resolved_pairings = pairing_store or PostgresPairingStore(pg_pool)
        resolved_connections = connection_repo or PostgresConnectionRepo(pg_pool)
        resolved_rate_limiter = rate_limiter or RedisRateLimiter(redis)
        resolved_refresh_lock = refresh_lock or RedisRefreshLock(redis)

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
    resolved_oidc = oidc_validator or AppOidcJwksValidator(
        jwks_url=cfg.app_oidc_jwks_url,
        issuer=cfg.app_oidc_issuer,
    )
    resolved_internal = internal_jwt or _build_internal_jwt(cfg)
    internal_tokens = InternalTokenService(
        issuer=resolved_internal,
        validator=resolved_internal,
        clock=clock,
    )

    sessions = SessionService(
        sessions=resolved_sessions,
        clock=clock,
        session_ttl_seconds=cfg.session_ttl_seconds,
        authorize_url=cfg.app_oidc_authorize_url,
        token_url=cfg.app_oidc_token_url,
        client_id=cfg.app_oidc_client_id,
        client_secret=cfg.app_oidc_client_secret,
        redirect_uri=cfg.app_oidc_redirect_uri,
        issuer=cfg.app_oidc_issuer,
        oidc_validator=resolved_oidc,
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
        sessions=sessions,
        pairings=pairings,
        credentials=credentials,
        internal_tokens=internal_tokens,
        rate_limiter=resolved_rate_limiter,
        clock=clock,
        session_store=resolved_sessions,
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


async def get_current_user(
    request: Request,
    fantasy_session: Annotated[str | None, Cookie(alias="fantasy_session")] = None,
) -> tuple[AppUser, SessionRecord]:
    """Resolve the authenticated app user from the session cookie.

    Args:
        request: Incoming request (cookie name may be overridden by settings).
        fantasy_session: Default cookie binding.

    Returns:
        App user and session record.

    Raises:
        SessionError: When unauthenticated.
    """
    container = get_container()
    cookie_name = container.settings.cookie_name
    session_id = request.cookies.get(cookie_name) or fantasy_session
    if not session_id:
        raise SessionError()
    return await container.sessions.require_user(session_id)


async def require_csrf(
    request: Request,
    x_csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> AppUser:
    """Enforce CSRF double-submit and exact Origin on mutations.

    Args:
        request: Incoming request.
        x_csrf_token: CSRF header from the browser.

    Returns:
        Authenticated app user.

    Raises:
        SessionError: On CSRF or origin failure.
    """
    container = get_container()
    user, session = await get_current_user(request)

    origin = request.headers.get("origin")
    if origin is not None and origin not in container.settings.cors_origins:
        raise SessionError("origin not allowed")

    csrf_cookie = request.cookies.get(container.settings.csrf_cookie_name)
    if not x_csrf_token or not csrf_cookie or x_csrf_token != csrf_cookie:
        raise SessionError("csrf failed")
    if x_csrf_token != session.csrf_token:
        raise SessionError("csrf failed")
    return user


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
        return get_container().internal_tokens.user_from_token(token)
    except ValidationError:
        raise
