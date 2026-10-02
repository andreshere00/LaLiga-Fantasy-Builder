"""OpenAPI document generation for the auth service."""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path
from typing import Any

from fastapi.openapi.utils import get_openapi

from fantasy_auth.api.deps import build_container
from fantasy_auth.config import Settings
from fantasy_auth.main import create_app

AUTH_DESCRIPTION = """
LaLiga Fantasy Builder **auth** service.

Browser clients use **session cookies** (``fantasy_session``, ``fantasy_csrf``)
and ``X-CSRF-Token`` on mutating routes. The frontend exchanges the session for
a short-lived internal JWT via ``POST /auth/token`` and sends that JWT to
``backend/api``.

``/internal/*`` routes require the internal JWT **and** ``X-Service-Token`` on
a private network. They must not be exposed on the public internet.
""".strip()

OPENAPI_TAGS: list[dict[str, str]] = [
    {"name": "health", "description": "Liveness and readiness probes."},
    {
        "name": "auth",
        "description": "Application OIDC login, session, internal JWT, and JWKS.",
    },
    {
        "name": "laliga",
        "description": "LaLiga B2C pairing, connection status, and unlink.",
    },
    {
        "name": "internal",
        "description": "Private credential exchange for the Fantasy API service.",
    },
]


def _doc_generation_settings() -> Settings:
    """Settings that avoid Postgres/Redis during schema export."""
    return Settings(
        use_memory_store=True,
        cookie_secure=False,
        log_json=False,
        token_vault_key_base64=base64.b64encode(b"k" * 32).decode(),
        internal_service_token="openapi-generation",
    )


def build_openapi_schema(app: Any) -> dict[str, Any]:
    """Build an OpenAPI 3 document from the FastAPI app."""
    return get_openapi(
        title=app.title,
        version=app.version,
        description=AUTH_DESCRIPTION,
        routes=app.routes,
        tags=OPENAPI_TAGS,
    )


def generate_openapi() -> dict[str, Any]:
    """Create the auth app in memory and return its OpenAPI schema."""
    settings = _doc_generation_settings()
    container = build_container(settings)
    app = create_app(settings=settings, container=container)
    return build_openapi_schema(app)


def default_openapi_path() -> Path:
    """Return the default committed OpenAPI path under ``backend/auth``."""
    return Path(__file__).resolve().parents[2] / "openapi.json"


def write_openapi(schema: dict[str, Any], path: Path) -> None:
    """Write an OpenAPI document as formatted JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint: ``uv run generate-openapi``."""
    parser = argparse.ArgumentParser(
        description="Generate OpenAPI JSON from auth routes and Pydantic models",
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


if __name__ == "__main__":
    raise SystemExit(main())
