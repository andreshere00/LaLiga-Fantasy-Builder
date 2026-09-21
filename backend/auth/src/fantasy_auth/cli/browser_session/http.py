"""HTTP helpers for auth cookies and the Fantasy Builder API."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx

from fantasy_auth.cli.browser_session.errors import BrowserSessionError


@dataclass
class AuthClient:
    """Auth-service client using session cookies."""

    base_url: str
    session: str
    csrf: str
    origin: str
    transport: httpx.BaseTransport | None = None

    def exchange_token(self) -> str:
        """POST /auth/token and return the internal JWT.

        Returns:
            Internal JWT string.

        Raises:
            BrowserSessionError: When exchange fails.
        """
        url = f"{self.base_url.rstrip('/')}/auth/token"
        with httpx.Client(
            transport=self.transport,
            timeout=30.0,
            cookies=self._cookies(),
        ) as client:
            response = client.post(
                url,
                headers={"Origin": self.origin, "X-CSRF-Token": self.csrf},
            )
        if not response.is_success:
            raise BrowserSessionError(
                f"POST /auth/token failed: {_error_detail(response)}",
            )
        token = response.json().get("access_token") if _is_object(response) else None
        if not token:
            raise BrowserSessionError("POST /auth/token missing access_token")
        return str(token)

    def is_linked(self) -> bool:
        """Return whether /laliga/connection reports a linked vault.

        Returns:
            True when the vault is linked.

        Raises:
            BrowserSessionError: When the connection probe fails.
        """
        url = f"{self.base_url.rstrip('/')}/laliga/connection"
        with httpx.Client(
            transport=self.transport,
            timeout=15.0,
            cookies=self._cookies(),
        ) as client:
            response = client.get(url)
        if response.status_code == 401:
            raise BrowserSessionError("GET /laliga/connection unauthorized")
        if not response.is_success:
            raise BrowserSessionError(
                f"GET /laliga/connection failed: HTTP {response.status_code}",
            )
        data = response.json()
        return bool(isinstance(data, dict) and data.get("linked"))

    def _cookies(self) -> dict[str, str]:
        """Return auth cookie header values."""
        return {"fantasy_session": self.session, "fantasy_csrf": self.csrf}


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
        response = self._request("GET", path)
        return response.json()

    def put_json(self, path: str, body: dict[str, Any]) -> Any:
        """PUT a JSON body with the internal JWT.

        Args:
            path: Absolute API path.
            body: JSON object payload.

        Returns:
            Parsed JSON body, or ``{}`` when the response is empty.

        Raises:
            BrowserSessionError: When the request fails or is not JSON.
        """
        response = self._request("PUT", path, json_body=body)
        if not response.content:
            return {}
        try:
            return response.json()
        except json.JSONDecodeError as exc:
            raise BrowserSessionError(f"API PUT {path} returned non-JSON") from exc

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
    ) -> httpx.Response:
        """Send one JSON API request.

        Args:
            method: HTTP method.
            path: Absolute API path.
            json_body: Optional JSON object for PUT/POST.

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
        with httpx.Client(transport=self.transport, timeout=60.0) as client:
            response = client.request(method, url, headers=headers, json=json_body)
        if not response.is_success:
            verb = f"PUT {path}" if method == "PUT" else path
            raise BrowserSessionError(
                f"API {verb} failed: {_error_detail(response)}",
            )
        return response


def exchange_token(
    *,
    auth_base: str,
    origin: str,
    session: str,
    csrf: str,
    transport: httpx.BaseTransport | None = None,
) -> str:
    """POST /auth/token and return the internal JWT.

    Args:
        auth_base: Auth service origin.
        origin: Origin header for CSRF.
        session: ``fantasy_session`` cookie.
        csrf: CSRF cookie and header.
        transport: Optional httpx transport (tests).

    Returns:
        Internal JWT string.
    """
    return AuthClient(
        base_url=auth_base,
        session=session,
        csrf=csrf,
        origin=origin,
        transport=transport,
    ).exchange_token()


def connection_linked(
    *,
    auth_base: str,
    session: str,
    csrf: str,
    transport: httpx.BaseTransport | None = None,
) -> bool:
    """Return whether /laliga/connection reports a linked vault.

    Args:
        auth_base: Auth service origin.
        session: ``fantasy_session`` cookie.
        csrf: CSRF cookie and header.
        transport: Optional httpx transport (tests).

    Returns:
        True when the vault is linked.
    """
    return AuthClient(
        base_url=auth_base,
        session=session,
        csrf=csrf,
        origin="",
        transport=transport,
    ).is_linked()


def _error_detail(response: httpx.Response) -> str:
    """Summarize an HTTP error body without leaking large payloads."""
    try:
        data = response.json()
    except json.JSONDecodeError:
        return f"HTTP {response.status_code}"
    if isinstance(data, dict):
        error = data.get("error") or ""
        detail = data.get("detail") or ""
        return f"HTTP {response.status_code} {error} {detail}".strip()
    return f"HTTP {response.status_code}"


def _is_object(response: httpx.Response) -> bool:
    """Return True when the response JSON is an object."""
    try:
        return isinstance(response.json(), dict)
    except json.JSONDecodeError:
        return False
