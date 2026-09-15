"""Internal token use cases for cross-service authentication."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from fantasy_auth.domain.errors import ValidationError
from fantasy_auth.domain.users import AppUser, extract_app_user_from_claims
from fantasy_auth.ports.internal_tokens import InternalTokenIssuer, InternalTokenValidator
from fantasy_auth.ports.repos import Clock


@dataclass(frozen=True, slots=True)
class IssuedInternalToken:
    """Minted internal access token for the Fantasy API.

    Attributes:
        access_token: Signed JWT string.
        token_type: Always ``Bearer``.
        expires_in: Lifetime in seconds.
        expires_at: Unix expiry timestamp.
    """

    access_token: str
    expires_in: int
    expires_at: int
    token_type: str = "Bearer"


class InternalTokenService:
    """Issue and validate internal JWTs for service-to-service trust.

    Args:
        issuer: Token minting adapter.
        validator: Token validation adapter (may be the same object).
        clock: Injectable clock.
    """

    def __init__(
        self,
        *,
        issuer: InternalTokenIssuer,
        validator: InternalTokenValidator,
        clock: Clock,
    ) -> None:
        self._issuer = issuer
        self._validator = validator
        self._clock = clock

    def issue_for_user(self, user: AppUser) -> IssuedInternalToken:
        """Mint an internal JWT for an authenticated app user.

        Args:
            user: Application user from the browser session.

        Returns:
            Issued token payload without secrets beyond the JWT itself.
        """
        token, expires_in, expires_at = self._issuer.issue(
            user,
            now=self._clock.now(),
        )
        return IssuedInternalToken(
            access_token=token,
            expires_in=expires_in,
            expires_at=expires_at,
        )

    def user_from_token(self, token: str) -> AppUser:
        """Validate an internal JWT and map claims to ``AppUser``.

        Args:
            token: Bearer JWT string.

        Returns:
            Application user identity.

        Raises:
            ValidationError: When the token is invalid or missing ``sub``.
        """
        claims = self._validator.validate(token)
        try:
            return extract_app_user_from_claims(claims)
        except ValueError as exc:
            raise ValidationError(str(exc), category="jwt_invalid") from exc

    def public_jwks(self) -> Mapping[str, Any]:
        """Return the public JWKS for API verification.

        Returns:
            JWKS document.
        """
        return self._issuer.public_jwks()
