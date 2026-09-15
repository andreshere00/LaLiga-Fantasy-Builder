"""JWKS-backed validation for auth-issued internal JWTs."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import jwt
from jwt import PyJWKClient

from fantasy_api.domain.errors import UnauthorizedError


class InternalJwtValidator:
    """Validate RS256 internal JWTs against the auth JWKS endpoint.

    Args:
        jwks_url: Auth ``/.well-known/jwks.json`` URL.
        issuer: Expected ``iss``.
        audience: Expected ``aud``.
    """

    def __init__(
        self,
        *,
        jwks_url: str,
        issuer: str,
        audience: str,
    ) -> None:
        self._issuer = issuer
        self._audience = audience
        self._jwks_client = PyJWKClient(jwks_url, cache_keys=True)

    def validate(self, token: str) -> Mapping[str, Any]:
        """Validate signature and standard claims.

        Args:
            token: JWT string.

        Returns:
            Verified claims.

        Raises:
            UnauthorizedError: On validation failure.
        """
        try:
            signing_key = self._jwks_client.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "iss", "aud", "sub"]},
            )
        except jwt.PyJWTError as exc:
            raise UnauthorizedError(str(exc)) from exc
        except Exception as exc:
            raise UnauthorizedError(f"jwks validation failed: {exc}") from exc


class StaticInternalJwtValidator:
    """Test double that validates with a static PEM public key.

    Args:
        public_key_pem: PEM-encoded RSA public key.
        issuer: Expected issuer.
        audience: Expected audience.
    """

    def __init__(
        self,
        *,
        public_key_pem: bytes | str,
        issuer: str,
        audience: str,
    ) -> None:
        self._public_key_pem = (
            public_key_pem.encode() if isinstance(public_key_pem, str) else public_key_pem
        )
        self._issuer = issuer
        self._audience = audience

    def validate(self, token: str) -> Mapping[str, Any]:
        """Validate JWT with the static public key.

        Args:
            token: JWT string.

        Returns:
            Verified claims.

        Raises:
            UnauthorizedError: On validation failure.
        """
        try:
            return jwt.decode(
                token,
                self._public_key_pem,
                algorithms=["RS256"],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "iss", "aud", "sub"]},
            )
        except jwt.PyJWTError as exc:
            raise UnauthorizedError(str(exc)) from exc
