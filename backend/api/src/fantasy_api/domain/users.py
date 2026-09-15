"""Application user model (mirrors auth AppUser public fields)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class AppUser:
    """Authenticated application user from an internal JWT.

    Attributes:
        user_id: Stable subject from JWT ``sub``.
        email: Optional email claim.
        name: Optional display name claim.
    """

    user_id: str
    email: str | None = None
    name: str | None = None


def extract_app_user_from_claims(claims: Mapping[str, Any]) -> AppUser:
    """Map verified JWT claims to ``AppUser``.

    Args:
        claims: Verified JWT payload.

    Returns:
        Application user.

    Raises:
        ValueError: When ``sub`` is missing.
    """
    sub = claims.get("sub")
    if not sub:
        raise ValueError("token missing sub")
    return AppUser(
        user_id=str(sub),
        email=str(claims["email"]) if claims.get("email") else None,
        name=str(claims["name"]) if claims.get("name") else None,
    )
