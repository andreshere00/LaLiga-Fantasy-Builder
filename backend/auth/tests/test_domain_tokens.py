# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from typing import Any

import pytest

from fantasy_auth.domain.tokens import (
    calculate_expiry,
    is_expired,
    merge_refresh,
    normalize_bundle,
    TokenBundle,
)


NOW = 1_700_000_000
CLIENT_ID = "af88bcff-1157-40a0-b579-030728aacf0b"
POLICY = "B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN"
SCOPE = "openid offline_access"


def _bundle(**overrides: Any) -> TokenBundle:
    base = dict(
        access_token="access",
        expires_on=NOW + 3600,
        client_id=CLIENT_ID,
        policy=POLICY,
        scope=SCOPE,
        refresh_token="refresh",
        id_token="id",
    )
    base.update(overrides)
    return TokenBundle(**base)


# ---- Happy path ---- #


def test_calculate_expiry_prefers_expires_on() -> None:
    # Arrange
    payload = {"expires_on": NOW + 100, "expires_in": 999}

    # Act
    result = calculate_expiry(payload, now=NOW)

    # Assert
    assert result == NOW + 100


def test_calculate_expiry_prefers_id_token_expires_in_over_expires_in() -> None:
    # Arrange
    payload = {"id_token_expires_in": 120, "expires_in": 999}

    # Act
    result = calculate_expiry(payload, now=NOW)

    # Assert
    assert result == NOW + 120


def test_normalize_bundle_from_string_sets_default_ttl() -> None:
    # Arrange / Act
    bundle = normalize_bundle(
        "raw-token",
        now=NOW,
        client_id=CLIENT_ID,
        policy=POLICY,
        scope=SCOPE,
    )

    # Assert
    assert bundle.access_token == "raw-token"
    assert bundle.expires_on == NOW + 86_400


def test_normalize_bundle_tags_client_policy_scope() -> None:
    # Arrange
    raw = {
        "access_token": "a",
        "id_token": "b",
        "refresh_token": "c",
        "expires_in": 3600,
        "client_id": CLIENT_ID,
    }

    # Act
    bundle = normalize_bundle(
        raw,
        now=NOW,
        client_id="other",
        policy=POLICY,
        scope=SCOPE,
    )

    # Assert
    assert bundle.client_id == CLIENT_ID
    assert bundle.policy == POLICY
    assert bundle.scope == SCOPE
    assert bundle.expires_on == NOW + 3600


def test_is_expired_inside_skew_window_returns_true() -> None:
    # Arrange
    bundle = _bundle(expires_on=NOW + 30)

    # Act / Assert
    assert is_expired(bundle, now=NOW, skew_seconds=60) is True


def test_is_expired_outside_skew_window_returns_false() -> None:
    # Arrange
    bundle = _bundle(expires_on=NOW + 600)

    # Act / Assert
    assert is_expired(bundle, now=NOW, skew_seconds=60) is False


def test_merge_refresh_prefers_id_token_as_bearer() -> None:
    # Arrange
    previous = _bundle()
    raw = {"id_token": "new-id", "expires_in": 100, "refresh_token": "new-r"}

    # Act
    merged = merge_refresh(previous, raw, now=NOW)

    # Assert
    assert merged.access_token == "new-id"
    assert merged.refresh_token == "new-r"
    assert merged.policy == POLICY


# ---- Error paths ---- #


def test_normalize_bundle_missing_access_without_fallback_raises() -> None:
    # Arrange
    raw = {"id_token": "only-id"}

    # Act / Assert
    with pytest.raises(ValueError, match="missing access_token"):
        normalize_bundle(
            raw,
            now=NOW,
            client_id=CLIENT_ID,
            policy=POLICY,
            scope=SCOPE,
            allow_id_token_fallback=False,
        )


# ---- Edge cases ---- #


def test_normalize_bundle_id_token_fallback_when_enabled() -> None:
    # Arrange
    raw = {"id_token": "only-id", "expires_in": 10}

    # Act
    bundle = normalize_bundle(
        raw,
        now=NOW,
        client_id=CLIENT_ID,
        policy=POLICY,
        scope=SCOPE,
        allow_id_token_fallback=True,
    )

    # Assert
    assert bundle.access_token == "only-id"


def test_calculate_expiry_defaults_to_24h() -> None:
    # Arrange / Act
    result = calculate_expiry({}, now=NOW)

    # Assert
    assert result == NOW + 86_400


def test_merge_refresh_keeps_previous_refresh_when_absent() -> None:
    # Arrange
    previous = _bundle(refresh_token="old-r")
    raw = {"access_token": "new-a", "expires_in": 50}

    # Act
    merged = merge_refresh(previous, raw, now=NOW)

    # Assert
    assert merged.refresh_token == "old-r"
    assert merged.access_token == "new-a"
