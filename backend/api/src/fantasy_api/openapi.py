"""OpenAPI document generation for the Fantasy Builder API.

Builds the same schema served by Swagger UI (``/docs``) from:
- FastAPI route signatures and ``response_model`` / ``responses``
- Google-style endpoint docstrings (summary + description)
- Registered Pydantic input/output models
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute

from fantasy_api.config import Settings
from fantasy_api.schemas.common import ErrorResponse

API_DESCRIPTION = """
LaLiga Fantasy Builder API.

Authenticated callers send an **internal JWT** minted by the auth service
(``POST /auth/token``). League and team routes exchange that JWT for a
short-lived Fantasy bearer via auth's private credential endpoint; bearers are
never returned to clients. Calendar reads call public upstream Fantasy resources
and omit the LaLiga bearer while still requiring the internal JWT.
""".strip()

OPENAPI_TAGS: list[dict[str, str]] = [
    {"name": "health", "description": "Liveness and readiness probes."},
    {"name": "me", "description": "Application identity and credential probes."},
    {
        "name": "leagues",
        "description": (
            "LaLiga Fantasy league reads (standing, activity, teams). "
            "Thin authenticated proxies of competition league resources."
        ),
    },
    {
        "name": "teams",
        "description": (
            "LaLiga Fantasy team money and lineup reads/writes. "
            "Thin authenticated proxies of competition team resources."
        ),
    },
    {
        "name": "calendar",
        "description": (
            "Matchday calendar and stats (public Fantasy reads). "
            "Requires an internal JWT; upstream calls omit the LaLiga bearer."
        ),
    },
    {
        "name": "players",
        "description": (
            "LaLiga Fantasy player catalog, market value, and league cards. "
            "Catalog and market value are public; league cards are authenticated."
        ),
    },
]

ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {
        "description": "Unauthorized or LaLiga re-auth required.",
        "model": ErrorResponse,
    },
    502: {
        "description": "Auth or Fantasy upstream failure.",
        "model": ErrorResponse,
    },
    503: {
        "description": "Fantasy upstream unavailable.",
        "model": ErrorResponse,
    },
}


def build_openapi_schema(app: FastAPI) -> dict[str, Any]:
    """Build the OpenAPI document for ``app`` (Swagger-compatible).

    Uses FastAPI route metadata, Pydantic models declared on endpoints, and
    each endpoint's docstring (first line → summary, remainder → description).

    Args:
        app: Configured FastAPI application.

    Returns:
        OpenAPI 3.x document as a plain dictionary.
    """
    if app.openapi_schema is not None:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        openapi_version=app.openapi_version,
        description=app.description or API_DESCRIPTION,
        routes=app.routes,
        tags=OPENAPI_TAGS,
    )
    schema.setdefault("components", {}).setdefault("securitySchemes", {})
    schema["components"]["securitySchemes"]["HTTPBearer"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "Auth-issued internal JWT (audience ``fantasy-api``).",
    }
    _apply_bearer_security(schema)
    _apply_google_docstrings(app, schema)
    _ensure_error_components(schema)
    app.openapi_schema = schema
    return schema


def attach_openapi(app: FastAPI) -> None:
    """Install a custom OpenAPI generator on ``app`` for Swagger UI sync.

    Args:
        app: FastAPI application to configure.
    """

    def _openapi() -> dict[str, Any]:
        return build_openapi_schema(app)

    app.openapi = _openapi  # type: ignore[method-assign]


def generate_openapi(
    *,
    settings: Settings | None = None,
    output: Path | str | None = None,
) -> dict[str, Any]:
    """Generate the OpenAPI document and optionally write it to disk.

    Args:
        settings: Optional settings override for ``create_app``.
        output: Optional destination path for ``openapi.json``.

    Returns:
        OpenAPI document dictionary.
    """
    from fantasy_api.main import create_app

    app = create_app(settings=settings)
    schema = build_openapi_schema(app)
    if output is not None:
        write_openapi(schema, Path(output))
    return schema


def write_openapi(schema: dict[str, Any], path: Path) -> None:
    """Write an OpenAPI document as formatted JSON.

    Args:
        schema: OpenAPI document.
        path: Destination file path.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def default_openapi_path() -> Path:
    """Return the default committed OpenAPI path under ``backend/api``."""
    return Path(__file__).resolve().parents[2] / "openapi.json"


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint: ``uv run generate-openapi``."""
    parser = argparse.ArgumentParser(
        description=(
            "Generate OpenAPI/Swagger JSON from Fantasy Builder API routes, "
            "docstrings, and Pydantic I/O models"
        ),
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help=f"Output path (default: {default_openapi_path()})",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Print JSON to stdout instead of writing a file",
    )
    args = parser.parse_args(argv)
    schema = generate_openapi()
    if args.stdout:
        print(json.dumps(schema, ensure_ascii=False, indent=2))
        return 0
    path = args.output or default_openapi_path()
    write_openapi(schema, path)
    print(f"Wrote OpenAPI document to {path}")
    return 0


def _apply_bearer_security(schema: dict[str, Any]) -> None:
    """Mark protected paths as requiring HTTP Bearer auth."""
    public_prefixes = ("/health", "/docs", "/redoc", "/openapi.json")
    public_operations = {
        ("GET", "/players"),
        ("GET", "/players/{player_id}/market-value"),
    }
    paths = schema.get("paths", {})
    for path, methods in paths.items():
        if path.startswith(public_prefixes):
            continue
        if not isinstance(methods, dict):
            continue
        for method, operation in methods.items():
            if method.startswith("x-") or not isinstance(operation, dict):
                continue
            if (method.upper(), path) in public_operations:
                operation.pop("security", None)
                continue
            operation.setdefault("security", [{"HTTPBearer": []}])


def _ensure_error_components(schema: dict[str, Any]) -> None:
    """Register the shared ErrorResponse component schema."""
    components = schema.setdefault("components", {})
    schemas = components.setdefault("schemas", {})
    schemas.setdefault("ErrorResponse", ErrorResponse.model_json_schema())


def _apply_google_docstrings(app: FastAPI, schema: dict[str, Any]) -> None:
    """Keep decorator summaries; strip Args/Returns/Raises from descriptions."""
    paths = schema.get("paths", {})
    for path, route in _iter_api_routes(app.routes):
        path_item = paths.get(path)
        if not isinstance(path_item, dict):
            continue
        for method in route.methods:
            operation = path_item.get(method.lower())
            if isinstance(operation, dict):
                enrich_operation_from_docstring(operation, route.endpoint)


def _iter_api_routes(
    routes: list[Any],
    prefix: str = "",
) -> Iterator[tuple[str, APIRoute]]:
    """Yield OpenAPI paths and APIRoute objects, including nested routers."""
    for route in routes:
        if isinstance(route, APIRoute):
            yield f"{prefix}{route.path}", route
            continue
        original = getattr(route, "original_router", None)
        include_ctx = getattr(route, "include_context", None)
        nested_prefix = prefix
        if include_ctx is not None:
            nested_prefix = f"{prefix}{getattr(include_ctx, 'prefix', '') or ''}"
        nested = getattr(original, "routes", None)
        if nested:
            yield from _iter_api_routes(nested, nested_prefix)


def enrich_operation_from_docstring(
    operation: dict[str, Any],
    endpoint: Callable[..., Any],
) -> None:
    """Copy Google-style docstring summary/description onto an operation.

    FastAPI already does this for routes; this strips ``Args`` / ``Returns`` /
    ``Raises`` so Swagger shows the narrative body only. An existing ``summary``
    (from the route decorator) is left unchanged.

    Args:
        operation: OpenAPI operation object to mutate.
        endpoint: Python endpoint callable.
    """
    doc = (endpoint.__doc__ or "").strip()
    if not doc:
        return
    lines = [line.strip() for line in doc.splitlines()]
    summary = lines[0]
    body_lines: list[str] = []
    for line in lines[1:]:
        if line.startswith("Args:") or line.startswith("Returns:"):
            break
        if line.startswith("Raises:"):
            break
        body_lines.append(line)
    description = "\n".join(body_lines).strip()
    if not operation.get("summary"):
        operation["summary"] = summary
    if description:
        operation["description"] = description
    else:
        operation.pop("description", None)


if __name__ == "__main__":
    raise SystemExit(main())
