"""AES-GCM v1 token vault (env key; swappable for KMS later)."""

from __future__ import annotations

import base64
import json
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from fantasy_auth.domain.tokens import TokenBundle

ENVELOPE_VERSION = 1
NONCE_SIZE = 12


class AesGcmTokenVault:
    """Seal/open ``TokenBundle`` with AES-GCM and a versioned envelope.

    Envelope layout: ``version (1 byte) || nonce (12) || ciphertext+tag``.

    Args:
        key: Raw 32-byte AES key.

    Raises:
        ValueError: If the key is not 32 bytes.
    """

    def __init__(self, key: bytes) -> None:
        if len(key) != 32:
            raise ValueError("TOKEN_VAULT_KEY must be exactly 32 bytes")
        self._aesgcm = AESGCM(key)

    @classmethod
    def from_base64(cls, key_b64: str) -> AesGcmTokenVault:
        """Build a vault from a base64-encoded 32-byte key.

        Args:
            key_b64: Base64 string of the AES key.

        Returns:
            Configured vault instance.

        Raises:
            ValueError: If decoding fails or key length is wrong.
        """
        if not key_b64:
            raise ValueError("TOKEN_VAULT_KEY_BASE64 is required")
        key = base64.b64decode(key_b64)
        return cls(key)

    def seal(self, bundle: TokenBundle) -> bytes:
        """Encrypt a token bundle into a versioned envelope.

        Args:
            bundle: Plaintext token bundle.

        Returns:
            Opaque sealed blob.
        """
        payload = json.dumps(_bundle_to_dict(bundle), separators=(",", ":")).encode()
        nonce = os.urandom(NONCE_SIZE)
        ciphertext = self._aesgcm.encrypt(nonce, payload, None)
        return bytes([ENVELOPE_VERSION]) + nonce + ciphertext

    def open(self, sealed: bytes) -> TokenBundle:
        """Decrypt a sealed envelope back to a token bundle.

        Args:
            sealed: Opaque sealed blob.

        Returns:
            Plaintext token bundle.

        Raises:
            ValueError: If the envelope is truncated or version is unsupported.
        """
        if len(sealed) < 1 + NONCE_SIZE + 16:
            raise ValueError("sealed blob too short")
        version = sealed[0]
        if version != ENVELOPE_VERSION:
            raise ValueError(f"unsupported vault envelope version: {version}")
        nonce = sealed[1 : 1 + NONCE_SIZE]
        ciphertext = sealed[1 + NONCE_SIZE :]
        plaintext = self._aesgcm.decrypt(nonce, ciphertext, None)
        data = json.loads(plaintext.decode())
        return _dict_to_bundle(data)


def _bundle_to_dict(bundle: TokenBundle) -> dict[str, Any]:
    return {
        "access_token": bundle.access_token,
        "id_token": bundle.id_token,
        "refresh_token": bundle.refresh_token,
        "token_type": bundle.token_type,
        "expires_in": bundle.expires_in,
        "expires_on": bundle.expires_on,
        "client_id": bundle.client_id,
        "policy": bundle.policy,
        "scope": bundle.scope,
        "id_token_expires_in": bundle.id_token_expires_in,
        "refresh_token_expires_in": bundle.refresh_token_expires_in,
    }


def _dict_to_bundle(data: dict[str, Any]) -> TokenBundle:
    return TokenBundle(
        access_token=str(data["access_token"]),
        id_token=data.get("id_token"),
        refresh_token=data.get("refresh_token"),
        token_type=str(data.get("token_type") or "Bearer"),
        expires_in=int(data["expires_in"]),
        expires_on=int(data["expires_on"]),
        client_id=str(data["client_id"]),
        policy=str(data["policy"]),
        scope=str(data["scope"]),
        id_token_expires_in=data.get("id_token_expires_in"),
        refresh_token_expires_in=data.get("refresh_token_expires_in"),
    )
