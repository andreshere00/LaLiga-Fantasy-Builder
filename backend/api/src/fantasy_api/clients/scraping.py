"""HTTP client for the private scraping service."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

import httpx
from pydantic import SecretStr

from fantasy_api.domain.errors import UpstreamError

logger = logging.getLogger(__name__)

_ALLOWED_PATHS = frozenset({"/internal/players/futbolfantasy"})


class ScrapingClient:
    """Call scraping internal routes with a service token."""

    def __init__(
        self,
        *,
        base_url: str,
        service_token: SecretStr,
        timeout_seconds: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = service_token
        self._http = httpx.AsyncClient(
            transport=transport,
            timeout=timeout_seconds,
        )

    @property
    def enabled(self) -> bool:
        """Return True when a scraping base URL is configured."""
        return bool(self._base_url)

    async def aclose(self) -> None:
        """Close the shared HTTP client."""
        await self._http.aclose()

    async def get_json(self, path: str, params: Mapping[str, str]) -> Any:
        """GET a fixed internal path and return JSON."""
        if not self.enabled:
            raise UpstreamError(
                "scraping disabled",
                status_code=503,
                category="scraping_disabled",
            )
        if path not in _ALLOWED_PATHS:
            raise UpstreamError("invalid scraping path", category="scraping_error")
        url = f"{self._base_url}{path}"
        headers = {
            "Accept": "application/json",
            "X-Service-Token": self._token.get_secret_value(),
        }
        try:
            response = await self._http.get(url, params=params, headers=headers)
        except httpx.TimeoutException as exc:
            logger.warning("scraping timeout on %s: %s", path, type(exc).__name__)
            raise UpstreamError(
                "scraping unavailable",
                status_code=503,
                category="scraping_unavailable",
            ) from None
        except httpx.HTTPError as exc:
            logger.warning("scraping error on %s: %s", path, type(exc).__name__)
            raise UpstreamError(
                "scraping unavailable",
                status_code=503,
                category="scraping_unavailable",
            ) from None
        if response.status_code == 404:
            raise UpstreamError(
                "stats source not found",
                status_code=404,
                category="stats_source_not_found",
            )
        if response.status_code in {429, 503}:
            raise UpstreamError(
                "scraping unavailable",
                status_code=503,
                category="scraping_unavailable",
            )
        if response.status_code in {401, 403}:
            raise UpstreamError(
                "scraping misconfigured",
                status_code=502,
                category="scraping_error",
            )
        if response.status_code < 200 or response.status_code >= 300:
            raise UpstreamError(
                "scraping error",
                status_code=502,
                category="scraping_error",
            )
        try:
            return response.json()
        except ValueError as exc:
            logger.warning("scraping non-json on %s: %s", path, type(exc).__name__)
            raise UpstreamError(
                "scraping error",
                status_code=502,
                category="scraping_error",
            ) from None
