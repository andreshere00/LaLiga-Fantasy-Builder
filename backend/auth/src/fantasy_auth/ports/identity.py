"""Ports for application identity (own IdP, not LaLiga)."""

from __future__ import annotations

from typing import Any, Mapping, Protocol


class AppOidcValidator(Protocol):
    """Validates RS256 ID tokens from the application OIDC provider."""

    async def validate(
        self,
        token: str,
        *,
        audience: str,
        issuer: str,
        nonce: str | None = None,
    ) -> Mapping[str, Any]:
        """Validate signature and standard OIDC claims.

        Args:
            token: JWT ID token string.
            audience: Expected ``aud`` claim (app client ID).
            issuer: Expected ``iss`` claim.
            nonce: Expected ``nonce`` when issued at authorize time.

        Returns:
            Verified claims mapping.

        Raises:
            ValidationError: On signature or claim failure.
        """
