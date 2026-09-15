"""Ports for cross-service internal JWT minting and validation."""

from __future__ import annotations

from typing import Any, Mapping, Protocol

from fantasy_auth.domain.users import AppUser


class InternalTokenIssuer(Protocol):
    """Mints short-lived internal JWTs for the Fantasy API audience."""

    def issue(self, user: AppUser, *, now: int) -> tuple[str, int, int]:
        """Issue an RS256 internal access token.

        Args:
            user: Authenticated application user.
            now: Current Unix timestamp in seconds.

        Returns:
            Tuple of ``(jwt, expires_in, expires_at)``.
        """

    def public_jwks(self) -> Mapping[str, Any]:
        """Return the public JWKS document for token verification.

        Returns:
            JWKS mapping with a ``keys`` list.
        """


class InternalTokenValidator(Protocol):
    """Validates internal JWTs issued by the auth service."""

    def validate(self, token: str) -> Mapping[str, Any]:
        """Validate signature and standard claims.

        Args:
            token: JWT access token string.

        Returns:
            Verified claims mapping.

        Raises:
            ValidationError: On signature or claim failure.
        """
