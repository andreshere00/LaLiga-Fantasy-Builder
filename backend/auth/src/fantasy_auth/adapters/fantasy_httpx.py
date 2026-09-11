"""httpx adapter for the unofficial LaLiga Fantasy API."""

from __future__ import annotations

from typing import Any

import httpx

from fantasy_auth.domain.errors import ProviderError


class HttpxFantasyClient:
    """Minimal Fantasy client for ``GET /api/v4/user/me``.

    Args:
        origin: Fantasy API origin
            (``https://fantasy-api.llt-services.com``).
        transport: Optional httpx transport for mocking.
    """

    def __init__(
        self,
        *,
        origin: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._origin = origin.rstrip("/")
        self._transport = transport

    async def get_current_user(self, bearer_token: str) -> dict[str, Any]:
        """Fetch the authenticated manager profile.

        Args:
            bearer_token: LaLiga B2C bearer token.

        Returns:
            JSON body from ``GET /api/v4/user/me``.

        Raises:
            ProviderError: On non-OK responses (status preserved, no body leak).
        """
        url = f"{self._origin}/api/v4/user/me"
        headers = {
            "Authorization": f"Bearer {bearer_token}",
            "Accept": "application/json",
            "x-lang": "es",
        }
        async with httpx.AsyncClient(transport=self._transport, timeout=30.0) as client:
            response = await client.get(url, headers=headers)

        if response.status_code == 401:
            raise ProviderError(
                "fantasy unauthorized",
                status_code=401,
                category="fantasy_unauthorized",
            )
        if not response.is_success:
            raise ProviderError(
                "fantasy request failed",
                status_code=response.status_code,
                category="fantasy_error",
            )
        return response.json()
