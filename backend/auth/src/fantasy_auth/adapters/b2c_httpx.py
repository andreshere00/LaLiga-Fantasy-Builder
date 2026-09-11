"""httpx adapter for LaLiga Azure AD B2C OAuth2."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import httpx

from fantasy_auth.domain.errors import InvalidGrant, ProviderError
from fantasy_auth.domain.tokens import TokenBundle, normalize_bundle


class HttpxB2CClient:
    """Outbound B2C client using httpx.

    Args:
        client_id: Public LaLiga B2C client ID.
        signin_policy: Policy for authorize / code exchange / refresh.
        token_base_url: ``…/oauth2/v2.0/token`` URL.
        authorize_url: ``…/oauth2/v2.0/authorize`` URL.
        allow_id_token_fallback: Prefer id_token when access_token absent.
        clock_now: Callable returning Unix seconds (injectable for tests).
        transport: Optional httpx transport (for mocking).
    """

    def __init__(
        self,
        *,
        client_id: str,
        signin_policy: str,
        token_base_url: str,
        authorize_url: str,
        allow_id_token_fallback: bool = False,
        clock_now: Any = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client_id = client_id
        self._signin_policy = signin_policy
        self._token_base_url = token_base_url
        self._authorize_url = authorize_url
        self._allow_id_token_fallback = allow_id_token_fallback
        self._clock_now = clock_now or (lambda: __import__("time").time())
        self._transport = transport

    def build_authorize_url(
        self,
        *,
        redirect_uri: str,
        code_challenge: str,
        state: str,
        nonce: str | None = None,
    ) -> str:
        """Build the interactive Authorization Code + PKCE authorize URL.

        Deliberately omits ``prompt=login`` so existing SSO can complete.

        Args:
            redirect_uri: Registered redirect URI.
            code_challenge: PKCE S256 challenge.
            state: Opaque CSRF state.
            nonce: OIDC nonce (defaults to state).

        Returns:
            Full authorize URL.
        """
        params = {
            "p": self._signin_policy,
            "client_id": self._client_id,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "scope": "openid offline_access",
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "state": state,
            "nonce": nonce or state,
        }
        return f"{self._authorize_url}?{urlencode(params)}"

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

        Raises:
            ProviderError: On non-OK responses.
            InvalidGrant: When B2C returns invalid_grant.
        """
        scope = "openid offline_access"
        token_url = f"{self._token_base_url}?p={self._signin_policy}"
        data = {
            "grant_type": "authorization_code",
            "client_id": self._client_id,
            "code": code,
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier,
            "scope": scope,
        }
        result = await self._post_token(token_url, data)
        now = int(self._clock_now())
        try:
            return normalize_bundle(
                {**result, "client_id": self._client_id, "policy": self._signin_policy},
                now=now,
                client_id=self._client_id,
                policy=self._signin_policy,
                scope=scope,
                allow_id_token_fallback=self._allow_id_token_fallback,
            )
        except ValueError as exc:
            if "missing access_token" in str(exc) and result.get("id_token"):
                raise ProviderError(
                    "B2C returned id_token only; set LALIGA_ALLOW_ID_TOKEN_FALLBACK=true",
                    category="id_token_only",
                ) from exc
            raise

    async def refresh(
        self,
        *,
        refresh_token: str,
        client_id: str,
        policy: str,
        scope: str,
    ) -> dict[str, Any]:
        """Refresh tokens using the issuing policy, client, and scope.

        Args:
            refresh_token: Refresh token to redeem.
            client_id: Same client that issued the tokens.
            policy: Same B2C policy that issued the refresh token.
            scope: Same scope string used at issuance.

        Returns:
            Raw token JSON from B2C.

        Raises:
            InvalidGrant: On invalid_grant / AADB2C90088.
            ProviderError: On other failures.
        """
        token_url = f"{self._token_base_url}?p={policy}"
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
            "scope": scope,
        }
        return await self._post_token(token_url, data)

    async def _post_token(self, url: str, data: dict[str, str]) -> dict[str, Any]:
        async with httpx.AsyncClient(transport=self._transport, timeout=30.0) as client:
            response = await client.post(
                url,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        try:
            body = response.json()
        except Exception:
            body = {"error": response.text}

        if response.is_success:
            if not body.get("access_token") and not body.get("id_token"):
                raise ProviderError(
                    "token response missing access_token and id_token",
                    status_code=response.status_code,
                )
            return body

        error = str(body.get("error") or "")
        description = str(body.get("error_description") or error or "token request failed")
        if (
            response.status_code in (400, 401)
            or error == "invalid_grant"
            or "AADB2C90088" in description
        ):
            raise InvalidGrant(description)
        raise ProviderError(
            description,
            status_code=response.status_code,
            category="token_error",
        )
