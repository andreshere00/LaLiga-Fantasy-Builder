"""HTTP client for auth private credential endpoints."""

from __future__ import annotations

import json

import httpx
from pydantic import BaseModel, ConfigDict, StrictInt, StrictStr, ValidationError

from fantasy_api.domain.errors import NeedsReauthError, UpstreamError


class LaligaBearer(BaseModel):
    """LaLiga bearer returned by auth.

    Attributes:
        bearer_token: Token for Fantasy Authorization header.
        expires_at: Unix expiry.
        token_type: Usually ``Bearer``.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    bearer_token: StrictStr
    expires_at: StrictInt
    token_type: StrictStr = "Bearer"


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
        self._http = httpx.AsyncClient(transport=transport, timeout=30.0)

    async def aclose(self) -> None:
        """Close the shared HTTP client."""
        await self._http.aclose()

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
        response = await self._http.get(url, headers=headers)

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
        try:
            return LaligaBearer.model_validate(data)
        except ValidationError as exc:
            raise UpstreamError(
                "auth response had an unexpected shape",
                status_code=502,
                category="auth_error",
            ) from exc


def _safe_json(response: httpx.Response) -> dict:
    """Parse JSON body or return an empty dict."""
    try:
        data = response.json()
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}
