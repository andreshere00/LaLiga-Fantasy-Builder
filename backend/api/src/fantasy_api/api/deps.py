"""Dependency injection for the Fantasy Builder API."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Protocol

from fastapi import Header

from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.config import Settings, get_settings
from fantasy_api.domain.errors import UnauthorizedError
from fantasy_api.domain.users import AppUser, extract_app_user_from_claims
from fantasy_api.security.internal_jwt import InternalJwtValidator


class TokenValidator(Protocol):
    """Validates internal JWTs."""

    def validate(self, token: str) -> Any:
        """Validate a JWT and return claims."""


@dataclass
class AppContainer:
    """Process-lifetime services.

    Attributes:
        settings: Loaded settings.
        jwt_validator: Internal JWT validator.
        credentials: Auth credentials client.
    """

    settings: Settings
    jwt_validator: TokenValidator
    credentials: AuthCredentialsClient


_container: AppContainer | None = None


def build_container(
    settings: Settings | None = None,
    *,
    jwt_validator: TokenValidator | None = None,
    credentials: AuthCredentialsClient | None = None,
) -> AppContainer:
    """Build the API container.

    Args:
        settings: Optional settings override.
        jwt_validator: Optional validator override (tests).
        credentials: Optional credentials client override (tests).

    Returns:
        Wired container.
    """
    cfg = settings or get_settings()
    validator = jwt_validator or InternalJwtValidator(
        jwks_url=cfg.auth_jwks_url,
        issuer=cfg.internal_jwt_issuer,
        audience=cfg.internal_jwt_audience,
    )
    client = credentials or AuthCredentialsClient(
        base_url=cfg.auth_internal_base_url,
        service_token=cfg.internal_service_token,
    )
    return AppContainer(
        settings=cfg,
        jwt_validator=validator,
        credentials=client,
    )


def set_container(container: AppContainer) -> None:
    """Install the process-global container.

    Args:
        container: Container to install.
    """
    global _container
    _container = container


def get_container() -> AppContainer:
    """Return the process-global container.

    Returns:
        Application container.
    """
    global _container
    if _container is None:
        _container = build_container()
    return _container


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> tuple[AppUser, str]:
    """Resolve the caller from an internal Bearer JWT.

    Args:
        authorization: ``Authorization`` header.

    Returns:
        Tuple of app user and raw JWT string (for credential forwarding).

    Raises:
        UnauthorizedError: When the header or JWT is invalid.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise UnauthorizedError("missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise UnauthorizedError("missing bearer token")
    claims = get_container().jwt_validator.validate(token)
    try:
        user = extract_app_user_from_claims(claims)
    except ValueError as exc:
        raise UnauthorizedError(str(exc)) from exc
    return user, token
