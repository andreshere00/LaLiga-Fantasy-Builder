"""RS256 internal JWT adapter for cross-service authentication."""

from __future__ import annotations

import base64
import hashlib
from typing import Any, Mapping

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey, RSAPublicKey

from fantasy_auth.domain.errors import ValidationError
from fantasy_auth.domain.users import AppUser


def _b64url_uint(value: int) -> str:
    """Encode an unsigned integer as base64url without padding."""
    length = (value.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(value.to_bytes(length, "big")).rstrip(b"=").decode()


def generate_dev_rsa_keypair() -> tuple[str, str]:
    """Generate a development RSA key pair as PEM strings.

    Returns:
        Tuple of ``(private_pem, public_pem)``.
    """
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


class Rs256InternalJwt:
    """Mint and validate internal RS256 JWTs.

    Args:
        private_key_pem: PEM-encoded RSA private key used for signing.
        public_key_pem: PEM-encoded RSA public key used for verify/JWKS.
        issuer: Expected ``iss`` claim.
        audience: Expected ``aud`` claim.
        ttl_seconds: Token lifetime in seconds.
        key_id: Optional JWK ``kid``; derived from public key when omitted.
    """

    def __init__(
        self,
        *,
        private_key_pem: str,
        public_key_pem: str,
        issuer: str,
        audience: str,
        ttl_seconds: int = 300,
        key_id: str | None = None,
    ) -> None:
        self._private_key = serialization.load_pem_private_key(
            private_key_pem.encode(),
            password=None,
        )
        self._public_key = serialization.load_pem_public_key(public_key_pem.encode())
        if not isinstance(self._private_key, RSAPrivateKey):
            raise ValueError("INTERNAL_JWT_PRIVATE_KEY_PEM must be an RSA private key")
        if not isinstance(self._public_key, RSAPublicKey):
            raise ValueError("INTERNAL_JWT_PUBLIC_KEY_PEM must be an RSA public key")
        self._issuer = issuer
        self._audience = audience
        self._ttl_seconds = ttl_seconds
        self._key_id = key_id or self._derive_kid(public_key_pem)

    @staticmethod
    def _derive_kid(public_key_pem: str) -> str:
        digest = hashlib.sha256(public_key_pem.encode()).digest()
        return base64.urlsafe_b64encode(digest[:8]).rstrip(b"=").decode()

    def issue(self, user: AppUser, *, now: int) -> tuple[str, int, int]:
        """Issue an RS256 internal access token.

        Args:
            user: Authenticated application user.
            now: Current Unix timestamp in seconds.

        Returns:
            Tuple of ``(jwt, expires_in, expires_at)``.
        """
        expires_at = now + self._ttl_seconds
        claims: dict[str, Any] = {
            "sub": user.user_id,
            "iss": self._issuer,
            "aud": self._audience,
            "iat": now,
            "exp": expires_at,
        }
        if user.email:
            claims["email"] = user.email
        if user.name:
            claims["name"] = user.name
        token = jwt.encode(
            claims,
            self._private_key,
            algorithm="RS256",
            headers={"kid": self._key_id},
        )
        return token, self._ttl_seconds, expires_at

    def validate(self, token: str) -> Mapping[str, Any]:
        """Validate signature and standard claims.

        Args:
            token: JWT access token string.

        Returns:
            Verified claims mapping.

        Raises:
            ValidationError: On signature or claim failure.
        """
        try:
            return jwt.decode(
                token,
                self._public_key,
                algorithms=["RS256"],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "iss", "aud", "sub"]},
            )
        except jwt.PyJWTError as exc:
            raise ValidationError(str(exc), category="jwt_invalid") from exc

    def public_jwks(self) -> Mapping[str, Any]:
        """Return the public JWKS document for token verification.

        Returns:
            JWKS mapping with a ``keys`` list.
        """
        numbers = self._public_key.public_numbers()
        return {
            "keys": [
                {
                    "kty": "RSA",
                    "use": "sig",
                    "alg": "RS256",
                    "kid": self._key_id,
                    "n": _b64url_uint(numbers.n),
                    "e": _b64url_uint(numbers.e),
                }
            ]
        }
