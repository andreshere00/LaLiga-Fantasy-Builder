"""Verify Better Auth application JWTs against a configured, cached JWKS."""

from collections.abc import Mapping
from typing import Any

import jwt
from jwt import PyJWKClient

from fantasy_auth.domain.errors import ValidationError


class IdentityJwtValidator:
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
            raise ValidationError("invalid application token") from exc
