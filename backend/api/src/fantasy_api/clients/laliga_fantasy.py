"""httpx client for the unofficial LaLiga Fantasy API."""

from __future__ import annotations

import json
from typing import Any

import httpx

from fantasy_api.domain.errors import UpstreamError


class LaligaFantasyClient:
    """Async HTTP client for LaLiga Fantasy competition resources.

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
        self._http = httpx.AsyncClient(transport=transport, timeout=30.0)

    async def aclose(self) -> None:
        """Close the shared HTTP client."""
        await self._http.aclose()

    async def get_json(self, path: str, bearer_token: str | None = None) -> Any:
        """Perform a GET and return the JSON body.

        Args:
            path: Absolute path under the Fantasy origin (must start with ``/``).
            bearer_token: Optional LaLiga B2C bearer. Omit for public resources.

        Returns:
            Parsed JSON body (object or array).

        Raises:
            UpstreamError: On non-OK or non-JSON responses (no body leak).
        """
        url = f"{self._origin}{path}"
        headers = {
            "Accept": "application/json",
            "x-lang": "es",
        }
        if bearer_token:
            headers["Authorization"] = f"Bearer {bearer_token}"
        response = await self._http.get(url, headers=headers)

        if response.status_code == 401:
            raise UpstreamError(
                "fantasy unauthorized",
                status_code=401,
                category="fantasy_unauthorized",
            )
        if not response.is_success:
            raise UpstreamError(
                "fantasy request failed",
                status_code=response.status_code,
                category="fantasy_error",
            )
        try:
            return response.json()
        except json.JSONDecodeError as exc:
            raise UpstreamError(
                "fantasy response was not JSON",
                status_code=502,
                category="fantasy_error",
            ) from exc
