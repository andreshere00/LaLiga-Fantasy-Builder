"""Ports for cross-service internal JWT verification."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Protocol


class InternalTokenValidator(Protocol):
    """Validates internal JWTs issued by Better Auth."""

    def validate(self, token: str) -> Mapping[str, Any]:
        """Validate signature and standard claims.

        Args:
            token: JWT access token string.

        Returns:
            Verified claims mapping.

        Raises:
            ValidationError: On signature or claim failure.
        """
