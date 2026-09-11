"""Dependency injection container and FastAPI dependencies."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Cookie, Header, Request

from fantasy_auth.adapters.b2c_httpx import HttpxB2CClient
from fantasy_auth.adapters.fantasy_httpx import HttpxFantasyClient
from fantasy_auth.adapters.jwks import B2CJwksValidator
from fantasy_auth.adapters.memory import (
    MemoryConnectionRepo,
    MemoryPairingStore,
    MemoryRateLimiter,
    MemorySessionStore,
    SystemClock,
)
from fantasy_auth.adapters.vault_aesgcm import AesGcmTokenVault
from fantasy_auth.application.credentials import CredentialProvider
from fantasy_auth.application.pairing import PairingService
from fantasy_auth.application.sessions import SessionService
from fantasy_auth.config import Settings, get_settings
from fantasy_auth.domain.errors import SessionError
from fantasy_auth.domain.users import AppUser
from fantasy_auth.ports.repos import SessionRecord


@dataclass
class AppContainer:
    """Wired application services for the process lifetime.

    Attributes:
        settings: Loaded settings.
        sessions: Session use cases.
        pairings: Pairing use cases.
        credentials: Credential provider.
        rate_limiter: Rate limiter for pairing complete.
        clock: Clock implementation.
        session_store: Underlying session store (for cookie TTL).
    """

    settings: Settings
    sessions: SessionService
    pairings: PairingService
    credentials: CredentialProvider
    rate_limiter: MemoryRateLimiter
    clock: SystemClock
    session_store: MemorySessionStore


_container: AppContainer | None = None


def build_container(settings: Settings | None = None) -> AppContainer:
    """Build a fully wired container (memory stores by default).

    Args:
        settings: Optional settings override.

    Returns:
        Application container.
    """
    cfg = settings or get_settings()
    clock = SystemClock()
    session_store = MemorySessionStore()
    pairing_store = MemoryPairingStore()
    connection_repo = MemoryConnectionRepo()
    rate_limiter = MemoryRateLimiter()

    if not cfg.token_vault_key_base64:
        # Dev fallback: deterministic key so the API can boot; production
        # must set TOKEN_VAULT_KEY_BASE64.
        import base64

        vault_key = base64.b64encode(b"0" * 32).decode()
    else:
        vault_key = cfg.token_vault_key_base64
    vault = AesGcmTokenVault.from_base64(vault_key)

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

    sessions = SessionService(
        sessions=session_store,
        clock=clock,
        session_ttl_seconds=cfg.session_ttl_seconds,
        authorize_url=cfg.app_oidc_authorize_url,
        token_url=cfg.app_oidc_token_url,
        client_id=cfg.app_oidc_client_id,
        client_secret=cfg.app_oidc_client_secret,
        redirect_uri=cfg.app_oidc_redirect_uri,
        issuer=cfg.app_oidc_issuer,
    )
    pairings = PairingService(
        pairings=pairing_store,
        connections=connection_repo,
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
        connections=connection_repo,
        vault=vault,
        b2c=b2c,
        clock=clock,
        refresh_skew_seconds=cfg.refresh_skew_seconds,
        allow_id_token_fallback=cfg.laliga_allow_id_token_fallback,
    )
    return AppContainer(
        settings=cfg,
        sessions=sessions,
        pairings=pairings,
        credentials=credentials,
        rate_limiter=rate_limiter,
        clock=clock,
        session_store=session_store,
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
