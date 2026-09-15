"""Startup validation and fail-fast production checks."""

from __future__ import annotations

import base64
import logging

from fantasy_auth.config import Settings

logger = logging.getLogger("fantasy_auth.startup")

DEV_VAULT_KEY_BYTES = b"0" * 32


class StartupError(RuntimeError):
    """Fatal configuration or dependency failure during boot."""


def resolve_vault_key(settings: Settings) -> tuple[str, bool]:
    """Resolve the AES-GCM vault key, tracking whether a dev fallback was used.

    Args:
        settings: Application settings.

    Returns:
        Tuple of ``(base64_key, used_dev_fallback)``.

    Raises:
        StartupError: When production mode lacks a vault key.
    """
    if settings.token_vault_key_base64:
        raw = base64.b64decode(settings.token_vault_key_base64, validate=True)
        if len(raw) != 32:
            raise StartupError("TOKEN_VAULT_KEY_BASE64 must decode to 32 bytes")
        return settings.token_vault_key_base64, False

    if not settings.use_memory_store:
        raise StartupError("TOKEN_VAULT_KEY_BASE64 is required when USE_MEMORY_STORE=false")

    fallback = base64.b64encode(DEV_VAULT_KEY_BYTES).decode()
    return fallback, True


def validate_settings(settings: Settings) -> None:
    """Validate settings required for the selected storage mode.

    Args:
        settings: Application settings.

    Raises:
        StartupError: On missing production configuration.
    """
    if settings.use_memory_store:
        return
    if not settings.database_url:
        raise StartupError("DATABASE_URL is required when USE_MEMORY_STORE=false")
    if not settings.redis_url:
        raise StartupError("REDIS_URL is required when USE_MEMORY_STORE=false")
    if not settings.token_vault_key_base64:
        raise StartupError("TOKEN_VAULT_KEY_BASE64 is required when USE_MEMORY_STORE=false")
    if not settings.app_oidc_jwks_url:
        raise StartupError("APP_OIDC_JWKS_URL is required in production mode")
    if not settings.internal_jwt_private_key_pem:
        raise StartupError("INTERNAL_JWT_PRIVATE_KEY_PEM is required when USE_MEMORY_STORE=false")
    if not settings.internal_jwt_public_key_pem:
        raise StartupError("INTERNAL_JWT_PUBLIC_KEY_PEM is required when USE_MEMORY_STORE=false")
    if not settings.internal_service_token:
        raise StartupError("INTERNAL_SERVICE_TOKEN is required when USE_MEMORY_STORE=false")


def log_vault_key_status(*, used_dev_fallback: bool) -> None:
    """Emit a structured warning when the deterministic vault key is used.

    Args:
        used_dev_fallback: Whether the zero-derived development key was chosen.
    """
    if used_dev_fallback:
        logger.warning(
            "token_vault_using_dev_fallback",
            extra={
                "event": "token_vault_using_dev_fallback",
                "detail": (
                    "TOKEN_VAULT_KEY_BASE64 unset; using deterministic "
                    "development key. Do not use in production."
                ),
            },
        )
    else:
        logger.info(
            "token_vault_key_configured",
            extra={"event": "token_vault_key_configured"},
        )
