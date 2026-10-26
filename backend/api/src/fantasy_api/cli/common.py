"""Shared helpers for Fantasy Builder API CLIs."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Mapping
from typing import Any
from urllib.parse import quote

import httpx
from pydantic import ValidationError

from fantasy_api.cli.contracts import (
    dump_validated_response,
    query_adapter,
    response_adapter,
    safe_error_body,
    validate_response,
)

DEFAULT_AUTH_BASE = "http://localhost:3000"
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
        "--jwt",
        default=os.environ.get("INTERNAL_JWT"),
        help="Better Auth application JWT",
    )
    parser.add_argument(
        "--origin",
        default=os.environ.get("FANTASY_ORIGIN", DEFAULT_ORIGIN),
        help="Application origin",
    )


def resolve_jwt(args: argparse.Namespace, *, command: str) -> str | None:
    """Return the supplied Better Auth JWT without persisting credentials.

    Args:
        args: Parsed CLI namespace.
        command: CLI name shown in missing-credentials help (e.g. ``fantasy-teams``).

    Returns:
        Internal JWT, or ``None`` when credentials are missing or exchange fails.
    """
    jwt = normalize(args.jwt)
    if jwt:
        return jwt

    print(
        "Missing credentials. Provide --jwt / INTERNAL_JWT. Run "
        "fantasy-browser-session --exports to sign in using Better Auth. "
        "Legacy session/CSRF exports are no longer supported.",
        file=sys.stderr,
    )
    return None


def normalize(value: str | None) -> str:
    """Strip whitespace and accidental line breaks."""
    if not value:
        return ""
    return value.replace("\r", "").replace("\n", "").strip()


def api_get(
    api_base: str,
    path: str,
    jwt: str | None = None,
    params: Mapping[str, Any] | None = None,
) -> Any:
    """GET a Fantasy Builder API path, optionally with the internal JWT.

    Args:
        api_base: API service base URL.
        path: Absolute API path (e.g. ``/leagues``).
        jwt: Optional internal Bearer JWT (public routes omit it).

    Returns:
        Parsed JSON body.

    Raises:
        RuntimeError: On non-success responses.
    """
    request_path = path.split("?", maxsplit=1)[0]
    try:
        response_adapter(request_path)
        query_schema = query_adapter(request_path)
        checked_params: Mapping[str, Any] | None = params
        if params:
            if query_schema is None:
                raise ValueError("query parameters are not supported for this API path")
            serialized_params = dump_validated_response(query_schema.validate_python(dict(params)))
            if not isinstance(serialized_params, dict):
                raise ValueError("query schema did not produce an object")
            checked_params = serialized_params
    except (TypeError, ValueError, ValidationError) as exc:
        raise RuntimeError(f"Invalid API request for {path}") from exc

    url = f"{api_base.rstrip('/')}{path}"
    headers = {"Accept": "application/json"}
    if jwt:
        headers["Authorization"] = f"Bearer {jwt}"
    with httpx.Client(timeout=60.0) as client:
        response = client.get(url, headers=headers, params=checked_params)
    if response.status_code == 401:
        body = safe_json(response)
        error = body.get("error") or "unauthorized"
        detail = body.get("detail") or "request unauthorized"
        raise RuntimeError(f"API {path} → {error}: {detail}")
    if not response.is_success:
        body = safe_json(response)
        detail = body.get("detail") or body.get("error") or "request failed"
        raise RuntimeError(
            f"API {path} failed: {response.status_code} {detail}",
        )
    try:
        result = validate_response(request_path, response.json())
    except (ValueError, ValidationError):
        raise RuntimeError(f"API {path} returned an unexpected response") from None
    return dump_validated_response(result)


def path_segment(value: str | int) -> str:
    """Percent-encode a path segment for Fantasy Builder API paths."""
    return quote(str(value), safe="")


def safe_json(response: httpx.Response) -> dict[str, Any]:
    """Parse a validated API error object or return an empty dict."""
    try:
        data = response.json()
    except json.JSONDecodeError:
        return {}
    return safe_error_body(data)


def as_league_list(payload: Any) -> list[dict[str, Any]]:
    """Return the already-validated ``GET /leagues`` response rows."""
    if not isinstance(payload, list) or not all(isinstance(item, dict) for item in payload):
        raise RuntimeError("GET /leagues returned an unexpected response")
    return payload


def league_id(item: dict[str, Any]) -> Any:
    """Extract league id from a leagues list item."""
    return item.get("id") or item.get("leagueId") or item.get("league_id")


def my_team_id(item: dict[str, Any]) -> Any:
    """Extract the caller's team id from a leagues list item."""
    team = item.get("team")
    if isinstance(team, dict):
        return team.get("id") or team.get("teamId")
    return item.get("teamId") or item.get("team_id")


def api_build(api_base: str, path: str, jwt: str, body: object) -> Any:
    """POST validated preferences to the read-only builder; never a Fantasy mutation.

    Args:
        api_base: Application API base URL.
        path: Encoded builder path.
        jwt: Verified/exchanged internal JWT.
        body: Preferences validated before login by the caller.

    Returns:
        Validated build JSON.
    """
    from fantasy_api.schemas.lineup_builder import BuildPreferences

    if not path.startswith("/lineup-builder/leagues/") or not path.endswith("/build"):
        raise RuntimeError("only the read-only builder POST is supported")
    checked = BuildPreferences.model_validate(body)
    response_adapter(path)
    with httpx.Client(timeout=130) as client:
        response = client.post(
            f"{api_base.rstrip('/')}{path}",
            headers={"Accept": "application/json", "Authorization": f"Bearer {jwt}"},
            json=checked.model_dump(mode="json"),
        )
    if not response.is_success:
        error = safe_json(response)
        raise RuntimeError(f"Builder failed: {error.get('error', 'request_failed')}")
    try:
        return dump_validated_response(validate_response(path, response.json()))
    except (ValueError, ValidationError):
        raise RuntimeError("Builder returned an invalid response") from None
