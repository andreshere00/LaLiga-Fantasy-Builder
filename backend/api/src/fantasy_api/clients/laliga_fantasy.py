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
            bearer_token: Optional LaLiga B2C bearer token (public reads omit it).

        Returns:
            Parsed JSON body (object or array).

        Raises:
            UpstreamError: On non-OK or non-JSON responses (no body leak).
        """
        return await self._request_json("GET", path, bearer_token)

    async def put_json(
        self,
        path: str,
        bearer_token: str,
        body: dict[str, Any],
    ) -> Any:
        """Perform an authenticated PUT with a JSON body.

        Args:
            path: Absolute path under the Fantasy origin (must start with ``/``).
            bearer_token: LaLiga B2C bearer token.
            body: JSON-serializable request body.

        Returns:
            Parsed JSON body, or ``{}`` when the response has an empty body.

        Raises:
            UpstreamError: On non-OK or non-JSON responses (no body leak).
        """
        return await self._request_json("PUT", path, bearer_token, body=body)

    async def _request_json(
        self,
        method: str,
        path: str,
        bearer_token: str | None,
        *,
        body: dict[str, Any] | None = None,
    ) -> Any:
        """Send a Fantasy request and parse JSON.

        Args:
            method: HTTP method (``GET`` or ``PUT``).
            path: Absolute path under the Fantasy origin.
            bearer_token: LaLiga B2C bearer token (``None`` for public reads).
            body: Optional JSON body (PUT).

        Returns:
            Parsed JSON, or ``{}`` for an empty successful body.

        Raises:
            UpstreamError: On non-OK or non-JSON responses (no body leak).
        """
        url = f"{self._origin}{path}"
        headers = {
            "Accept": "application/json",
            "x-lang": "es",
        }
        if bearer_token is not None:
            headers["Authorization"] = f"Bearer {bearer_token}"
        request_kwargs: dict[str, Any] = {"headers": headers}
        if body is not None:
            headers["Content-Type"] = "application/json"
            request_kwargs["json"] = body

        response = await self._http.request(method, url, **request_kwargs)

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
        if not response.content:
            if method == "PUT" or response.status_code == 204:
                return {}
            raise UpstreamError(
                "fantasy response was not JSON",
                status_code=502,
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
