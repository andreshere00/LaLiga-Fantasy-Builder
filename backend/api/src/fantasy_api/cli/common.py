"""Shared helpers for Fantasy Builder API CLIs."""

from __future__ import annotations

import sys
from typing import Any

import httpx


def normalize(value: str | None) -> str:
    """Strip whitespace and accidental line breaks."""
    if not value:
        return ""
    return value.replace("\r", "").replace("\n", "").strip()


def exchange_token(
    *,
    auth_base: str,
    session: str,
    csrf: str,
    origin: str,
) -> str | None:
    """POST /auth/token and return the internal JWT.

    Args:
        auth_base: Auth service base URL.
        session: ``fantasy_session`` cookie value.
        csrf: CSRF token (header and cookie).
        origin: ``Origin`` header for CSRF checks.

    Returns:
        Internal JWT string, or ``None`` when exchange fails (message printed).
    """
    url = f"{auth_base.rstrip('/')}/auth/token"
    headers = {"Origin": origin, "X-CSRF-Token": csrf}
    with httpx.Client(
        timeout=30.0,
        cookies={"fantasy_session": session, "fantasy_csrf": csrf},
    ) as client:
        response = client.post(url, headers=headers)
    if response.status_code == 401:
        print(
            "Unauthorized — session expired or CSRF mismatch. "
            "Re-login at /auth/login and copy fresh cookies.",
            file=sys.stderr,
        )
        return None
    if not response.is_success:
        print(
            f"Token exchange failed: {response.status_code} {response.text}",
            file=sys.stderr,
        )
        return None
    token = response.json().get("access_token")
    if not token:
        print("Token exchange response missing access_token", file=sys.stderr)
        return None
    return str(token)


def api_get(api_base: str, path: str, jwt: str) -> Any:
    """GET a Fantasy Builder API path with the internal JWT.

    Args:
        api_base: API service base URL.
        path: Absolute API path (e.g. ``/leagues``).
        jwt: Internal Bearer JWT.

    Returns:
        Parsed JSON body.

    Raises:
        RuntimeError: On non-success responses.
    """
    url = f"{api_base.rstrip('/')}{path}"
    headers = {"Authorization": f"Bearer {jwt}", "Accept": "application/json"}
    with httpx.Client(timeout=60.0) as client:
        response = client.get(url, headers=headers)
    if response.status_code == 401:
        body = safe_json(response)
        error = body.get("error") or "unauthorized"
        detail = body.get("detail") or response.text
        raise RuntimeError(f"API {path} → {error}: {detail}")
    if not response.is_success:
        raise RuntimeError(
            f"API {path} failed: {response.status_code} {response.text[:300]}",
        )
    return response.json()


def safe_json(response: httpx.Response) -> dict[str, Any]:
    """Parse a JSON object response or return an empty dict."""
    try:
        data = response.json()
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def as_league_list(payload: Any) -> list[dict[str, Any]]:
    """Normalize /leagues payload to a list of objects."""
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        nested = payload.get("leagues")
        if isinstance(nested, list):
            return [item for item in nested if isinstance(item, dict)]
        return [payload]
    return []


def league_id(item: dict[str, Any]) -> Any:
    """Extract league id from a leagues list item."""
    return item.get("id") or item.get("leagueId") or item.get("league_id")


def my_team_id(item: dict[str, Any]) -> Any:
    """Extract the caller's team id from a leagues list item."""
    team = item.get("team")
    if isinstance(team, dict):
        return team.get("id") or team.get("teamId")
    return item.get("teamId") or item.get("team_id")
