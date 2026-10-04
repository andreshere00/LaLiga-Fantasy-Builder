"""OpenAPI document generation for the scraping service (internal docs only)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from fastapi.openapi.utils import get_openapi
from pydantic import SecretStr

from fantasy_scraping.config import Settings
from fantasy_scraping.main import create_app

SCRAPING_DESCRIPTION = """
LaLiga Fantasy Builder **scraping** service (private).

``/health/*`` probes are open. ``/internal/scrape/*`` and ``/internal/health``
require ``X-Service-Token`` on the ``internal`` network. The process also joins
``egress`` so it can reach FutbolFantasy; it is not on ``public``.

Interactive Swagger is served only when ``DEBUG=true``. The committed
``openapi.json`` is generated offline for review.
""".strip()

OPENAPI_TAGS: list[dict[str, str]] = [
    {"name": "health", "description": "Liveness and readiness probes."},
    {
        "name": "internal",
        "description": "Private scrape surface for the API and developer CLIs.",
    },
]


def _doc_generation_settings() -> Settings:
    """Settings that start the app without real secrets."""
    return Settings(scraping_service_token=SecretStr("openapi-generation"), debug=True)


def build_openapi_schema(app: Any) -> dict[str, Any]:
    """Build an OpenAPI 3 document from the FastAPI app."""
    return get_openapi(
        title=app.title,
        version=app.version,
        description=SCRAPING_DESCRIPTION,
        routes=app.routes,
        tags=OPENAPI_TAGS,
    )


def generate_openapi() -> dict[str, Any]:
    """Create the scraping app in memory and return its OpenAPI schema."""
    app = create_app(settings=_doc_generation_settings())
    return build_openapi_schema(app)


def default_openapi_path() -> Path:
    """Return the default committed OpenAPI path under ``backend/scraping``."""
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
        description="Generate OpenAPI JSON from scraping routes and Pydantic models",
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
