"""Helpers to mint internal JWTs in API tests (PyJWT)."""

from __future__ import annotations

import time
from typing import Any

import jwt

# Re-export for tests that simulate PyJWT validation failures.
InvalidTokenError = jwt.InvalidTokenError


def mint_internal_jwt(
    private_pem: str,
    *,
    sub: str = "app-user-1",
    email: str = "u@example.com",
    display_name: str = "User",
    issuer: str,
    audience: str,
    ttl_seconds: int = 300,
) -> str:
    """Return a signed RS256 JWT for test callers."""
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": sub,
        "email": email,
        "name": display_name,
        "iss": issuer,
        "aud": audience,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    return jwt.encode(payload, key=private_pem, algorithm="RS256")
