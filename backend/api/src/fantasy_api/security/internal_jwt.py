"""Verify Better Auth application JWTs against a configured, cached JWKS."""

from collections.abc import Mapping
from typing import Any

import jwt
from jwt import PyJWKClient

from fantasy_api.domain.errors import UnauthorizedError


class InternalJwtValidator:
    """Verify Ed25519 tokens; never trust token-supplied URLs or legacy RSA keys."""

    def __init__(self, *, jwks_url: str, issuer: str, audience: str) -> None:
        self._issuer = issuer
        self._audience = audience
        self._jwks_client = PyJWKClient(
            jwks_url, cache_keys=False, cache_jwk_set=True, lifespan=300, timeout=5
        )

    def validate(self, token: str) -> Mapping[str, Any]:
        """Validate signature, subject, issuer, audience, and bounded lifetime."""
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") != "EdDSA" or not isinstance(header.get("kid"), str):
                raise ValueError("invalid header")
            key = self._jwks_client.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                key.key,
                algorithms=["EdDSA"],
                audience=self._audience,
                issuer=self._issuer,
                leeway=30,
                options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            )
            if not isinstance(claims["sub"], str) or not claims["sub"].strip():
                raise ValueError("invalid subject")
            if (
                type(claims["exp"]) is not int
                or type(claims["iat"]) is not int
                or not 0 < claims["exp"] - claims["iat"] <= 900
            ):
                raise ValueError("invalid lifetime")
            return claims
        except (jwt.PyJWTError, ValueError, TypeError, KeyError, OSError) as exc:
            raise UnauthorizedError("invalid application token") from exc


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
