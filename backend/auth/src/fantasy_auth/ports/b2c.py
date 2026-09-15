"""Ports for Azure AD B2C token operations and JWKS validation."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Protocol

from fantasy_auth.domain.tokens import TokenBundle


class B2CClient(Protocol):
    """Outbound client for LaLiga Azure AD B2C OAuth2 endpoints."""

    def build_authorize_url(
        self,
        *,
        redirect_uri: str,
        code_challenge: str,
        state: str,
        nonce: str | None = None,
    ) -> str:
        """Build the interactive Authorization Code + PKCE authorize URL.

        Args:
            redirect_uri: Registered redirect URI.
            code_challenge: PKCE S256 challenge (base64url).
            state: Opaque CSRF state echoed on redirect.
            nonce: OIDC nonce (defaults to state when omitted).

        Returns:
            Full authorize URL.
        """

    async def exchange_code(
        self,
        *,
        code: str,
        code_verifier: str,
        redirect_uri: str,
    ) -> TokenBundle:
        """Exchange an authorization code for tokens (PKCE).

        Args:
            code: Authorization code from the redirect.
            code_verifier: PKCE verifier matching the challenge.
            redirect_uri: Must match the authorize request.

        Returns:
            Normalized token bundle tagged with issuing client/policy/scope.
        """

    async def refresh(
        self,
        *,
        refresh_token: str,
        client_id: str,
        policy: str,
        scope: str,
    ) -> Mapping[str, Any]:
        """Refresh tokens using the issuing policy, client, and scope.

        Args:
            refresh_token: Refresh token to redeem.
            client_id: Same client that issued the tokens.
            policy: Same B2C policy that issued the refresh token.
            scope: Same scope string used at issuance.

        Returns:
            Raw token JSON from B2C.
        """


class JwksValidator(Protocol):
    """Validates RS256 JWTs against B2C discovery / JWKS for a policy."""

    async def validate(
        self,
        token: str,
        *,
        policy: str,
        audience: str,
        nonce: str | None = None,
    ) -> Mapping[str, Any]:
        """Validate signature and standard claims.

        Args:
            token: JWT string (id_token or access_token).
            policy: B2C policy used for discovery/JWKS.
            audience: Expected ``aud`` claim (usually client_id).
            nonce: Expected ``nonce`` claim when present at authorize time.

        Returns:
            Verified claims mapping.

        Raises:
            ValidationError: On signature or claim failure.
        """
