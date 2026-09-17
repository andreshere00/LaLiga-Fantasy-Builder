"""Shared helpers for Fantasy Builder API CLIs."""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any
from urllib.parse import quote

import httpx

DEFAULT_AUTH_BASE = "http://localhost:8000"
DEFAULT_API_BASE = "http://localhost:8001"
DEFAULT_ORIGIN = "http://localhost:3000"


def add_common_cli_args(parser: argparse.ArgumentParser) -> None:
    """Register shared auth/API flags used by Fantasy Builder CLIs."""
    parser.add_argument(
        "--auth-base",
        default=os.environ.get("FANTASY_AUTH_BASE", DEFAULT_AUTH_BASE),
        help="Auth service base URL",
    )
    parser.add_argument(
        "--api-base",
        default=os.environ.get("FANTASY_API_BASE", DEFAULT_API_BASE),
        help="Fantasy Builder API base URL",
    )
    parser.add_argument(
        "--session",
        default=os.environ.get("FANTASY_SESSION") or os.environ.get("SESSION"),
        help="fantasy_session cookie (or env FANTASY_SESSION)",
    )
    parser.add_argument(
        "--csrf",
        default=os.environ.get("FANTASY_CSRF") or os.environ.get("CSRF"),
        help="CSRF token (or env FANTASY_CSRF)",
    )
    parser.add_argument(
        "--jwt",
        default=os.environ.get("INTERNAL_JWT"),
        help="Internal JWT (skips /auth/token when set)",
    )
    parser.add_argument(
        "--origin",
        default=os.environ.get("FANTASY_ORIGIN", DEFAULT_ORIGIN),
        help="Origin header for auth CSRF checks",
    )


def resolve_jwt(args: argparse.Namespace, *, command: str) -> str | None:
    """Return an internal JWT from ``args`` or exchange session cookies.

    Args:
        args: Parsed CLI namespace with jwt/session/csrf/auth-base/origin.
        command: CLI name shown in missing-credentials help (e.g. ``fantasy-teams``).

    Returns:
        Internal JWT, or ``None`` when credentials are missing or exchange fails.
    """
    jwt = normalize(args.jwt)
    if jwt:
        return jwt

    session = normalize(args.session)
    csrf = normalize(args.csrf)
    if not session or not csrf:
        print(
            "Missing credentials. Provide --jwt / INTERNAL_JWT, or:\n"
            "  export FANTASY_SESSION='…'\n"
            "  export FANTASY_CSRF='…'\n"
            f"Then re-run: uv run {command}",
            file=sys.stderr,
        )
        return None

    return exchange_token(
        auth_base=args.auth_base,
        session=session,
        csrf=csrf,
        origin=args.origin,
    )


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


def path_segment(value: str | int) -> str:
    """Percent-encode a path segment for Fantasy Builder API paths."""
    return quote(str(value), safe="")


def safe_json(response: httpx.Response) -> dict[str, Any]:
    """Parse a JSON object response or return an empty dict."""
    try:
        data = response.json()
    except json.JSONDecodeError:
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
