"""Read-only API-Football client with bounded pagination and sanitized errors."""

from typing import Any

import httpx
from pydantic import SecretStr

from fantasy_api.domain.errors import UpstreamError

FOOTBALL_ORIGIN = "https://v3.football.api-sports.io"


class FootballClient:
    """Fetch documented football API methods using a server-owned provider key.

    Args:
        api_key: Optional API-Sports key; an absent key disables this feature.
        timeout_seconds: Timeout for each request.
        transport: Optional transport for offline tests.
    """

    def __init__(
        self,
        *,
        api_key: SecretStr | None,
        timeout_seconds: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self._http = httpx.AsyncClient(
            base_url=FOOTBALL_ORIGIN,
            timeout=timeout_seconds,
            transport=transport,
        )

    async def aclose(self) -> None:
        """Close the process-lifetime provider client."""
        await self._http.aclose()

    async def get_rows(self, path: str, params: dict[str, str | int]) -> list[dict[str, Any]]:
        """Fetch all rows, validating provider envelopes on every page.

        Args:
            path: One of the adapter's fixed documented GET paths.
            params: Competition and season filters.

        Returns:
            Complete JSON object collection with no provider envelope.

        Raises:
            UpstreamError: On disabled configuration, provider failure, or bad JSON.
        """
        key = self._api_key.get_secret_value().strip() if self._api_key else ""
        if not key:
            raise UpstreamError(
                "standings provider is not configured",
                status_code=503,
                category="standings_unavailable",
            )
        if path not in {"/leagues", "/teams", "/standings", "/fixtures"}:
            raise ValueError("unsupported football API method")
        rows: list[dict[str, Any]] = []
        total_pages: int | None = None
        page = 1
        while True:
            query = dict(params)
            if page > 1:
                query["page"] = page
            try:
                response = await self._http.get(
                    path,
                    params=query,
                    headers={"Accept": "application/json", "x-apisports-key": key},
                )
            except httpx.HTTPError:
                raise UpstreamError(
                    "standings provider is unavailable",
                    status_code=503,
                    category="standings_unavailable",
                ) from None
            if not response.is_success:
                raise UpstreamError(
                    "standings provider request failed",
                    status_code=(
                        503 if response.status_code == 429 or response.status_code >= 500 else 502
                    ),
                    category=(
                        "standings_unavailable"
                        if response.status_code == 429 or response.status_code >= 500
                        else "standings_error"
                    ),
                    provider_status=response.status_code,
                )
            try:
                body = response.json()
                errors = body.get("errors") if isinstance(body, dict) else None
                if (
                    isinstance(errors, dict)
                    and isinstance(errors.get("plan"), str)
                    and errors["plan"].strip()
                ):
                    raise UpstreamError(
                        "standings provider plan does not cover the requested data",
                        status_code=503,
                        category="standings_plan_unavailable",
                    )
                batch, count = _parse_page(body, page)
                if total_pages is not None and count != total_pages:
                    raise ValueError("page count changed during fetch")
                total_pages = count
            except ValueError:
                raise UpstreamError(
                    "standings provider returned an invalid response",
                    status_code=502,
                    category="standings_error",
                ) from None
            rows.extend(batch)
            if page >= total_pages:
                return rows
            page += 1


def _parse_page(body: object, page: int) -> tuple[list[dict[str, Any]], int]:
    """Reject malformed, error-bearing, empty intermediate, or unbounded pages."""
    if not isinstance(body, dict) or body.get("errors") not in ([], {}):
        raise ValueError("invalid provider envelope")
    rows = body.get("response")
    paging = body.get("paging")
    results = body.get("results")
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise ValueError("invalid provider rows")
    if type(results) is not int or results != len(rows):
        raise ValueError("invalid provider result count")
    if not isinstance(paging, dict):
        raise ValueError("missing pagination")
    current, total = paging.get("current"), paging.get("total")
    if type(current) is not int or current != page or type(total) is not int:
        raise ValueError("invalid pagination")
    # API-Football uses total=0 for an empty result, and total=1 for one-page data.
    if total == 0 and page == 1 and not rows:
        return [], 1
    if not page <= total <= 100 or (not rows and page < total):
        raise ValueError("invalid pagination bounds")
    return rows, total
