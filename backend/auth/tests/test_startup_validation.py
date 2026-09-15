# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import base64
import logging

import pytest

from fantasy_auth.config import Settings
from fantasy_auth.startup import (
    StartupError,
    log_vault_key_status,
    resolve_vault_key,
    validate_settings,
)


# ---- Happy path ---- #


def test_resolve_vault_key_uses_configured_key() -> None:
    # Arrange
    key = base64.b64encode(b"k" * 32).decode()
    settings = Settings(token_vault_key_base64=key, use_memory_store=True)

    # Act
    resolved, used_fallback = resolve_vault_key(settings)

    # Assert
    assert resolved == key
    assert used_fallback is False


def test_resolve_vault_key_allows_dev_fallback_in_memory_mode() -> None:
    # Arrange
    settings = Settings(token_vault_key_base64="", use_memory_store=True)

    # Act
    resolved, used_fallback = resolve_vault_key(settings)

    # Assert
    assert used_fallback is True
    assert base64.b64decode(resolved) == b"0" * 32


def test_log_vault_key_status_warns_on_fallback(caplog: pytest.LogCaptureFixture) -> None:
    # Arrange
    caplog.set_level(logging.WARNING, logger="fantasy_auth.startup")

    # Act
    log_vault_key_status(used_dev_fallback=True)

    # Assert
    assert any("token_vault_using_dev_fallback" in r.message for r in caplog.records)


# ---- Error paths ---- #


def test_resolve_vault_key_rejects_missing_key_in_production() -> None:
    # Arrange
    settings = Settings(token_vault_key_base64="", use_memory_store=False)

    # Act / Assert
    with pytest.raises(StartupError, match="TOKEN_VAULT_KEY_BASE64"):
        resolve_vault_key(settings)


def test_validate_settings_requires_database_and_redis() -> None:
    # Arrange
    settings = Settings(
        use_memory_store=False,
        token_vault_key_base64=base64.b64encode(b"k" * 32).decode(),
        database_url="",
        redis_url="",
    )

    # Act / Assert
    with pytest.raises(StartupError, match="DATABASE_URL"):
        validate_settings(settings)


def test_cookie_samesite_none_requires_secure() -> None:
    # Arrange / Act / Assert
    with pytest.raises(ValueError, match="COOKIE_SAMESITE=none"):
        Settings(cookie_samesite="none", cookie_secure=False)


# ---- Edge cases ---- #


def test_resolve_vault_key_rejects_wrong_length() -> None:
    # Arrange
    settings = Settings(
        token_vault_key_base64=base64.b64encode(b"short").decode(),
        use_memory_store=True,
    )

    # Act / Assert
    with pytest.raises(StartupError, match="32 bytes"):
        resolve_vault_key(settings)
