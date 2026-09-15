"""HTTP client for auth private credential endpoints."""

from __future__ import annotations

import json
from dataclasses import dataclass

import httpx

from fantasy_api.domain.errors import NeedsReauthError, UpstreamError


@dataclass(frozen=True, slots=True)
class LaligaBearer:
    """LaLiga bearer returned by auth.

    Attributes:
        bearer_token: Token for Fantasy Authorization header.
        expires_at: Unix expiry.
        token_type: Usually ``Bearer``.
    """

    bearer_token: str
    expires_at: int
    token_type: str = "Bearer"


class AuthCredentialsClient:
    """Fetch short-lived LaLiga bearers from the auth service.

    Args:
        base_url: Auth service origin.
        service_token: Shared ``X-Service-Token`` value.
        transport: Optional httpx transport for tests.
    """

    def __init__(
        self,
        *,
        base_url: str,
        service_token: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._service_token = service_token
        self._transport = transport

    async def get_laliga_bearer(self, internal_jwt: str) -> LaligaBearer:
        """Request a LaLiga bearer for the JWT subject.

        Args:
            internal_jwt: Auth-issued internal access token.

        Returns:
            Short-lived LaLiga bearer (no refresh token).

        Raises:
            NeedsReauthError: When auth reports needs_reauth.
            UpstreamError: On other auth failures.
        """
        url = f"{self._base_url}/internal/laliga/bearer"
        headers = {
            "Authorization": f"Bearer {internal_jwt}",
            "X-Service-Token": self._service_token,
            "Accept": "application/json",
        }
        async with httpx.AsyncClient(
            transport=self._transport,
            timeout=30.0,
        ) as client:
            response = await client.get(url, headers=headers)

        if response.status_code == 401:
            body = _safe_json(response)
            if body.get("error") == "needs_reauth":
                raise NeedsReauthError(str(body.get("detail") or "needs_reauth"))
            raise UpstreamError(
                "auth unauthorized",
                status_code=401,
                category="unauthorized",
            )
        if not response.is_success:
            raise UpstreamError(
                "auth credential request failed",
                status_code=response.status_code,
                category="auth_error",
            )
        try:
            data = response.json()
        except json.JSONDecodeError as exc:
            raise UpstreamError(
                "auth response was not JSON",
                status_code=502,
                category="auth_error",
            ) from exc
        return LaligaBearer(
            bearer_token=str(data["bearer_token"]),
            expires_at=int(data["expires_at"]),
            token_type=str(data.get("token_type") or "Bearer"),
        )


def _safe_json(response: httpx.Response) -> dict:
    """Parse JSON body or return an empty dict."""
    try:
        data = response.json()
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}
