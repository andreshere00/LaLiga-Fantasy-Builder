# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
OPENAPI_FILES = {
    "api": ROOT / "backend/api/openapi.json",
    "auth": ROOT / "backend/auth/openapi.json",
    "scraping": ROOT / "backend/scraping/openapi.json",
}
EXPECTED_JSON_OPERATIONS = {"api": 47, "auth": 14, "scraping": 10}


def _is_schema_declared(schema: object) -> bool:
    """Return whether a documented request/response has a non-empty schema."""
    return isinstance(schema, dict) and bool(schema)


# ---- Happy path ---- #


def test_openapi_documents_typed_json_contracts_for_all_services() -> None:
    for service, path in OPENAPI_FILES.items():
        document: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
        json_operations = 0

        for route_path, path_item in document["paths"].items():
            for method, operation in path_item.items():
                if method not in {"get", "post", "put", "patch", "delete"}:
                    continue

                request_body = operation.get("requestBody")
                if request_body:
                    request_schema = request_body["content"]["application/json"].get("schema")
                    assert _is_schema_declared(
                        request_schema
                    ), f"{service} {method.upper()} {route_path} has an untyped JSON request"

                for status, response in operation.get("responses", {}).items():
                    if not status.startswith("2"):
                        continue
                    content = response.get("content", {})
                    json_content = content.get("application/json")
                    if json_content is None:
                        continue
                    json_operations += 1
                    assert _is_schema_declared(
                        json_content.get("schema")
                    ), f"{service} {method.upper()} {route_path} has an untyped JSON response"

        assert json_operations == EXPECTED_JSON_OPERATIONS[service]
