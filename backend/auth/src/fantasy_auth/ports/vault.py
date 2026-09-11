"""Port for sealing and opening LaLiga token bundles at rest."""

from __future__ import annotations

from typing import Protocol

from fantasy_auth.domain.tokens import TokenBundle


class TokenVault(Protocol):
    """Versioned sealed storage for ``TokenBundle`` secrets.

    Implementations may use an env key (AES-GCM v1) or KMS later without
    changing use cases.
    """

    def seal(self, bundle: TokenBundle) -> bytes:
        """Encrypt a token bundle into a versioned envelope.

        Args:
            bundle: Plaintext token bundle.

        Returns:
            Opaque sealed blob safe to persist.
        """

    def open(self, sealed: bytes) -> TokenBundle:
        """Decrypt a sealed envelope back to a token bundle.

        Args:
            sealed: Opaque sealed blob.

        Returns:
            Plaintext token bundle.
        """
