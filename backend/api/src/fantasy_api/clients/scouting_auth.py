"""Private client for explicit background-read delegation in Auth."""

from __future__ import annotations

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from fantasy_api.clients.auth_credentials import LaligaBearer
from fantasy_api.domain.errors import NeedsReauthError, UpstreamError
from fantasy_api.repositories.paths import segment


class GrantResponse(BaseModel):
    """Strict private grant contract."""

    model_config = ConfigDict(extra="forbid")
    grant_id: str = Field(min_length=32, max_length=128)


class ScoutingAuthClient:
    """Keep JWTs transient and redeem only saved opaque grants for background reads."""

    def __init__(
        self,
        base_url: str,
        service_token: str,
        worker_token: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._http = httpx.AsyncClient(base_url=base_url, timeout=30, transport=transport)
        self._service_token = service_token
        self._worker_token = worker_token

    async def aclose(self) -> None:
        """Close the shared private client."""
        await self._http.aclose()

    async def _request(
        self,
        method: str,
        league: str,
        action: str,
        jwt: str | None = None,
        body: object = None,
    ) -> object:
        headers = {"X-Service-Token": self._service_token if jwt else self._worker_token}
        if jwt:
            headers["Authorization"] = f"Bearer {jwt}"
        try:
            response = await self._http.request(
                method,
                f"/internal/scouting/leagues/{segment(league)}/{action}",
                headers=headers,
                json=body,
            )
            if response.status_code == 401:
                raise NeedsReauthError("scouting delegation requires reconnection")
            if not response.is_success:
                raise UpstreamError("scouting delegation failed", status_code=502)
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise UpstreamError("scouting delegation unavailable", status_code=502) from exc

    async def create(self, jwt: str, league: str) -> str:
        """Create a delegation using the verified caller's JWT."""
        data = await self._request("PUT", league, "grant", jwt)
        try:
            return GrantResponse.model_validate(data).grant_id
        except ValidationError as exc:
            raise UpstreamError("invalid delegation response", status_code=502) from exc

    async def revoke(self, jwt: str, league: str) -> None:
        """Revoke the caller's now-unused delegation."""
        await self._request("DELETE", league, "grant", jwt)

    async def redeem(self, grant: str, league: str, *, retry_unauthorized: bool = False) -> str:
        """Resolve a transient LaLiga bearer without a browser JWT."""
        data = await self._request(
            "POST",
            league,
            "bearer",
            body={"grant_id": grant, "retry_unauthorized": retry_unauthorized},
        )
        try:
            return LaligaBearer.model_validate(data).bearer_token
        except ValidationError as exc:
            raise UpstreamError("invalid credential response", status_code=502) from exc
