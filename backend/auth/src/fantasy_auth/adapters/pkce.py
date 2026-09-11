"""PKCE and opaque secret helpers."""

from __future__ import annotations

import base64
import hashlib
import secrets


def generate_verifier(nbytes: int = 32) -> str:
    """Generate a cryptographically random PKCE code_verifier.

    Args:
        nbytes: Number of random bytes before base64url encoding.

    Returns:
        URL-safe base64 string without padding.
    """
    return base64.urlsafe_b64encode(secrets.token_bytes(nbytes)).rstrip(b"=").decode()


def s256_challenge(verifier: str) -> str:
    """Compute the PKCE S256 code_challenge for a verifier.

    Args:
        verifier: PKCE code_verifier.

    Returns:
        BASE64URL(SHA256(verifier)) without padding.
    """
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def generate_state(nbytes: int = 16) -> str:
    """Generate an opaque CSRF state / nonce value.

    Args:
        nbytes: Number of random bytes.

    Returns:
        URL-safe base64 string without padding.
    """
    return generate_verifier(nbytes)


def generate_pairing_secret(nbytes: int = 32) -> str:
    """Generate a one-time pairing secret for the local helper.

    Args:
        nbytes: Number of random bytes.

    Returns:
        URL-safe base64 string without padding.
    """
    return generate_verifier(nbytes)


def hash_secret(secret: str) -> str:
    """SHA-256 hex digest of a pairing secret (at-rest form).

    Args:
        secret: Plaintext pairing secret.

    Returns:
        Hex-encoded SHA-256 digest.
    """
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def constant_time_equals(left: str, right: str) -> bool:
    """Constant-time string comparison for hashed secrets.

    Args:
        left: First hex digest.
        right: Second hex digest.

    Returns:
        True when both strings are equal.
    """
    return secrets.compare_digest(left, right)
