"""JWKS-backed JWT validation for LaLiga B2C policies."""

from __future__ import annotations

from typing import Any

import httpx
import jwt
from jwt import PyJWKClient

from fantasy_auth.domain.errors import ValidationError


class B2CJwksValidator:
    """Validate RS256 JWTs against B2C discovery / JWKS for a policy.

    Args:
        discovery_base: Tenant root
            (e.g. ``https://login.laliga.es/laligadspprob2c.onmicrosoft.com``).
        issuer: Expected ``iss`` claim.
        transport: Optional httpx transport for discovery fetches.
    """

    def __init__(
        self,
        *,
        discovery_base: str,
        issuer: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._discovery_base = discovery_base.rstrip("/")
        self._issuer = issuer
        self._transport = transport
        self._jwks_clients: dict[str, PyJWKClient] = {}

    def jwks_url(self, policy: str) -> str:
        """Return the JWKS URL for a B2C policy.

        Args:
            policy: B2C policy name.

        Returns:
            JWKS endpoint URL.
        """
        return f"{self._discovery_base}/discovery/v2.0/keys?p={policy}"

    def discovery_url(self, policy: str) -> str:
        """Return the OIDC discovery URL for a B2C policy.

        Args:
            policy: B2C policy name.

        Returns:
            Discovery endpoint URL.
        """
        return (
            f"{self._discovery_base}/v2.0/.well-known/openid-configuration"
            f"?p={policy}"
        )

    def _get_jwks_client(self, policy: str) -> PyJWKClient:
        if policy not in self._jwks_clients:
            self._jwks_clients[policy] = PyJWKClient(
                self.jwks_url(policy),
                cache_keys=True,
            )
        return self._jwks_clients[policy]

    async def validate(
        self,
        token: str,
        *,
        policy: str,
        audience: str,
        nonce: str | None = None,
    ) -> dict[str, Any]:
        """Validate signature and standard claims (iss, aud, exp, nonce).

        Args:
            token: JWT string.
            policy: B2C policy used for JWKS.
            audience: Expected ``aud`` claim.
            nonce: Expected ``nonce`` when provided at authorize time.

        Returns:
            Verified claims mapping.

        Raises:
            ValidationError: On signature or claim failure.
        """
        try:
            jwks_client = self._get_jwks_client(policy)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=audience,
                issuer=self._issuer,
                options={"require": ["exp", "iss", "aud"]},
            )
        except jwt.PyJWTError as exc:
            raise ValidationError(str(exc), category="jwt_invalid") from exc
        except Exception as exc:
            raise ValidationError(
                f"jwks validation failed: {exc}",
                category="jwks_error",
            ) from exc

        if nonce is not None and claims.get("nonce") != nonce:
            raise ValidationError("nonce mismatch", category="nonce_mismatch")

        return claims


class StaticJwksValidator:
    """Test double that validates with a provided PEM public key.

    Args:
        public_key_pem: PEM-encoded RSA public key.
        issuer: Expected issuer.
    """

    def __init__(self, *, public_key_pem: bytes, issuer: str) -> None:
        self._public_key_pem = public_key_pem
        self._issuer = issuer

    async def validate(
        self,
        token: str,
        *,
        policy: str,
        audience: str,
        nonce: str | None = None,
    ) -> dict[str, Any]:
        """Validate JWT with the static public key.

        Args:
            token: JWT string.
            policy: Ignored (kept for Protocol compatibility).
            audience: Expected ``aud``.
            nonce: Expected ``nonce`` when provided.

        Returns:
            Verified claims.

        Raises:
            ValidationError: On failure.
        """
        del policy  # Protocol parity; static key ignores policy routing.
        try:
            claims = jwt.decode(
                token,
                self._public_key_pem,
                algorithms=["RS256"],
                audience=audience,
                issuer=self._issuer,
                options={"require": ["exp", "iss", "aud"]},
            )
        except jwt.PyJWTError as exc:
            raise ValidationError(str(exc), category="jwt_invalid") from exc

        if nonce is not None and claims.get("nonce") != nonce:
            raise ValidationError("nonce mismatch", category="nonce_mismatch")

        return claims
