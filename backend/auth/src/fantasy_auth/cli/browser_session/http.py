"""HTTP helpers for application JWTs and the Fantasy Builder API."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import ValidationError

from fantasy_auth.api.schemas import (
    AuthErrorResponse,
    ConnectionStatusResponse,
)
from fantasy_auth.cli.browser_session.contracts import (
    BrowserCompetitionStandings,
    require_recognized_response,
    response_adapter,
    validate_lineup_write,
)
from fantasy_auth.cli.browser_session.errors import BrowserSessionError


@dataclass
class FantasyClient:
    """Fantasy Builder API client using an internal JWT."""

    base_url: str
    jwt: str
    transport: httpx.BaseTransport | None = None

    def get_json(self, path: str) -> Any:
        """GET a JSON path with the internal JWT.

        Args:
            path: Absolute API path.

        Returns:
            Parsed JSON body.

        Raises:
            BrowserSessionError: When the request fails.
        """
        try:
            adapter = response_adapter("GET", path)
        except ValueError:
            raise BrowserSessionError(
                f"GET {path} has no browser-session response contract"
            ) from None
        response = self._request("GET", path)
        return _validated_api_json(response, adapter, "GET", path)

    def build_json(self, path: str, body: dict[str, Any]) -> Any:
        """Send only the read-only builder POST, with independent request/response validation."""
        from fantasy_auth.cli.browser_session.lineup_builder_contracts import BuildPreferences

        try:
            checked = BuildPreferences.model_validate(body)
            adapter = response_adapter("POST", path)
        except (ValueError, ValidationError):
            raise BrowserSessionError("Invalid read-only builder request") from None
        response = self._request(
            "POST", path, json_body=checked.model_dump(mode="json"), timeout=130.0
        )
        return _validated_api_json(response, adapter, "POST", path)

    def put_json(self, path: str, body: dict[str, Any]) -> Any:
        """PUT a JSON body with the internal JWT.

        Args:
            path: Absolute API path.
            body: JSON object payload.

        Returns:
            Parsed JSON body validated against the route response contract.

        Raises:
            BrowserSessionError: When the request fails or is not JSON.
        """
        try:
            request_body = validate_lineup_write(body)
            adapter = response_adapter("PUT", path)
        except (ValueError, ValidationError):
            raise BrowserSessionError(
                f"PUT {path} has an invalid request or no response contract"
            ) from None
        response = self._request("PUT", path, json_body=request_body)
        return _validated_api_json(response, adapter, "PUT", path)

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        timeout: float = 60.0,
    ) -> httpx.Response:
        """Send one JSON API request.

        Args:
            method: HTTP method.
            path: Absolute API path.
            json_body: Optional JSON object for PUT/POST.
            timeout: Request timeout in seconds; builds cover the server's 120-second deadline.

        Returns:
            Successful HTTP response.

        Raises:
            BrowserSessionError: When the status is not success.
        """
        url = f"{self.base_url.rstrip('/')}{path}"
        headers = {
            "Authorization": f"Bearer {self.jwt}",
            "Accept": "application/json",
        }
        if json_body is not None:
            headers["Content-Type"] = "application/json"
        with httpx.Client(transport=self.transport, timeout=timeout) as client:
            response = client.request(method, url, headers=headers, json=json_body)
        if not response.is_success:
            verb = f"PUT {path}" if method == "PUT" else path
            raise BrowserSessionError(
                f"API {verb} failed: {_error_detail(response)}",
            )
        return response


def connection_linked(
    *, auth_base: str, jwt: str, transport: httpx.BaseTransport | None = None
) -> bool:
    """Read the verified subject's LaLiga connection using its application JWT."""
    with httpx.Client(transport=transport, timeout=15) as client:
        response = client.get(
            f"{auth_base.rstrip('/')}/laliga/connection", headers={"Authorization": f"Bearer {jwt}"}
        )
    if not response.is_success:
        raise BrowserSessionError(f"Connection check failed: HTTP {response.status_code}")
    try:
        status = ConnectionStatusResponse.model_validate(response.json())
    except (ValueError, ValidationError):
        raise BrowserSessionError("Connection check returned an invalid response") from None
    return status.linked and not status.needs_reauth


def _error_detail(response: httpx.Response) -> str:
    """Summarize an HTTP error body without leaking large payloads."""
    try:
        error = AuthErrorResponse.model_validate(response.json())
    except (ValueError, ValidationError):
        return f"HTTP {response.status_code}"
    detail = error.detail or error.error
    return f"HTTP {response.status_code} {error.error} {detail}".strip()


def _validated_api_json(response: httpx.Response, adapter: Any, method: str, path: str) -> Any:
    """Validate an API response and return JSON-compatible wire data."""
    try:
        validated = adapter.validate_python(response.json())
        require_recognized_response(validated, allow_empty=method == "PUT")
        return adapter.dump_python(
            validated,
            mode="json",
            by_alias=True,
            exclude_none=not isinstance(validated, BrowserCompetitionStandings),
        )
    except (ValueError, ValidationError):
        raise BrowserSessionError(f"API {method} {path} returned an invalid response") from None


def _is_object(response: httpx.Response) -> bool:
    """Return True when the response JSON is an object."""
    try:
        return isinstance(response.json(), dict)
    except ValueError:
        return False
