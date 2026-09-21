"""Generate endpoint input/output schema documentation from OpenAPI."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from fantasy_api.openapi import default_openapi_path, generate_openapi

_DOC_INTRO = """# Fantasy Builder API — endpoint schemas

Machine-readable source of truth: [`backend/api/openapi.json`](../../backend/api/openapi.json)
(OpenAPI 3.1). Regenerate this file after route or schema changes:

```bash
cd backend/api
uv run generate-openapi
uv run generate-endpoint-schemas
```

From the repo root:

```bash
uv run poe generate-openapi
uv run poe generate-endpoint-schemas
```

This document covers **`backend/api`** (port 8001). Auth service routes on port 8000
are not included here.

## Authentication (common input)

| Location | Name | Type | Required | Description |
|----------|------|------|----------|-------------|
| Header | `Authorization` | string | Yes* | `Bearer <internal JWT>` from auth `POST /auth/token` |

\\* Not required for `/health`, `/health/live`, and `/health/ready`.

## Error responses (common output)

| HTTP | Schema | Body |
|------|--------|------|
| 401 | `ErrorResponse` | `error`, `detail` — unauthorized or `needs_reauth` |
| 422 | `HTTPValidationError` | FastAPI validation (`detail` array) |
| 502 | `ErrorResponse` | Auth or Fantasy upstream failure |
| 503 | `ErrorResponse` | Fantasy upstream unavailable |

Protected routes also declare these error shapes in OpenAPI; successful responses
below omit repeated error tables.

### ErrorResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `error` | string | yes | Machine-readable category |
| `detail` | string | yes | Human-readable message (no tokens) |

"""

# Ensure a blank line separates the intro from the first tag section.
_DOC_INTRO = _DOC_INTRO.rstrip() + "\n\n"

_TAG_ORDER = ("health", "me", "leagues", "teams", "calendar")


def default_schemas_doc_path() -> Path:
    """Return the default committed endpoint-schemas path under ``docs/api``."""
    return Path(__file__).resolve().parents[4] / "docs" / "api" / "endpoint-schemas.md"


def generate_endpoint_schemas_doc(
    schema: dict[str, Any],
    *,
    openapi_path: Path | None = None,
) -> str:
    """Build markdown documentation from an OpenAPI document.

    Args:
        schema: OpenAPI 3.x document.
        openapi_path: Optional path shown in the doc header (relative link).

    Returns:
        Markdown document body including the standard introduction.
    """
    components = schema.get("components", {})
    schemas = components.get("schemas", {})
    paths = schema.get("paths", {})
    tag_descriptions = {
        item["name"]: item.get("description", "")
        for item in schema.get("tags", [])
        if isinstance(item, dict) and "name" in item
    }

    intro = _DOC_INTRO.strip() + "\n"
    lines: list[str] = [intro]
    if openapi_path is not None:
        lines[0] = lines[0].replace(
            "[`backend/api/openapi.json`](../../backend/api/openapi.json)",
            f"[`backend/api/openapi.json`]({openapi_path.as_posix()})",
        )

    operations_by_tag: dict[str, list[tuple[str, str, dict[str, Any]]]] = {}
    for path, methods in sorted(paths.items()):
        for method, operation in methods.items():
            if method.startswith("x-") or not isinstance(operation, dict):
                continue
            tags = operation.get("tags") or ["other"]
            tag = tags[0]
            operations_by_tag.setdefault(tag, []).append(
                (method.upper(), path, operation),
            )

    ordered_tags = [t for t in _TAG_ORDER if t in operations_by_tag]
    for tag in sorted(operations_by_tag.keys()):
        if tag not in ordered_tags:
            ordered_tags.append(tag)

    for tag in ordered_tags:
        ops = operations_by_tag[tag]
        lines.append(f"## Tag: `{tag}`")
        desc = tag_descriptions.get(tag)
        if desc:
            lines.append("")
            lines.append(desc)
        lines.append("")
        for method, path, operation in ops:
            lines.extend(_render_operation(method, path, operation, schemas))
            lines.append("")

    lines.append("## Component schemas")
    lines.append("")
    lines.append(
        "Nested models referenced by the operations above. All Fantasy proxy models "
        "use `extra: allow` in Pydantic — additional upstream fields may appear at "
        "runtime without being listed here."
    )
    lines.append("")
    skip = {"HTTPValidationError", "ValidationError"}
    for name in sorted(schemas.keys()):
        if name in skip:
            continue
        lines.extend(_render_component_schema(name, schemas[name], schemas))
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def write_endpoint_schemas_doc(content: str, path: Path) -> None:
    """Write generated markdown to ``path``."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint: ``uv run generate-endpoint-schemas``."""
    parser = argparse.ArgumentParser(
        description="Generate endpoint schema markdown from openapi.json",
    )
    parser.add_argument(
        "--openapi",
        type=Path,
        default=None,
        help=f"OpenAPI JSON input (default: {default_openapi_path()})",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help=f"Output markdown path (default: {default_schemas_doc_path()})",
    )
    parser.add_argument(
        "--from-app",
        action="store_true",
        help="Build OpenAPI from the FastAPI app instead of reading openapi.json",
    )
    args = parser.parse_args(argv)

    openapi_file = args.openapi or default_openapi_path()
    if args.from_app:
        schema = generate_openapi()
    else:
        schema = json.loads(openapi_file.read_text(encoding="utf-8"))

    out_path = args.output or default_schemas_doc_path()
    content = generate_endpoint_schemas_doc(
        schema, openapi_path=Path("../../backend/api/openapi.json")
    )
    write_endpoint_schemas_doc(content, out_path)
    print(f"Wrote endpoint schemas doc to {out_path}")
    return 0


def _render_operation(
    method: str,
    path: str,
    operation: dict[str, Any],
    components: dict[str, Any],
) -> list[str]:
    """Render one operation section."""
    summary = operation.get("summary") or operation.get("operationId") or path
    lines = [f"### `{method}` `{path}`", "", summary, ""]
    security = operation.get("security")
    if security == []:
        lines.append("**Security:** none")
    elif security:
        lines.append("**Security:** HTTP Bearer (internal JWT)")
    else:
        lines.append("**Security:** none")
    lines.append("")

    inputs = _collect_inputs(operation, components)
    lines.append("#### Inputs")
    lines.append("")
    if not inputs:
        lines.append("No path, query, or body parameters.")
    else:
        lines.append("| Source | Name | Type | Required | Constraints | Description |")
        lines.append("|--------|------|------|----------|-------------|-------------|")
        for row in inputs:
            lines.append(
                "| "
                + " | ".join(
                    [
                        row["source"],
                        f"`{row['name']}`",
                        row["type"],
                        row["required"],
                        row["constraints"],
                        row["description"],
                    ]
                )
                + " |"
            )
    lines.append("")

    lines.append("#### Outputs")
    lines.append("")
    success = operation.get("responses", {}).get("200") or operation.get("responses", {}).get("201")
    if not success:
        lines.append("No `200` response documented.")
    else:
        content = success.get("content", {}).get("application/json", {})
        body_schema = content.get("schema")
        if body_schema:
            lines.extend(_render_response_schema(body_schema, components))
        else:
            lines.append("Empty or non-JSON success body.")
    lines.append("")
    return lines


def _collect_inputs(
    operation: dict[str, Any],
    components: dict[str, Any],
) -> list[dict[str, str]]:
    """Collect path, query, header, and body parameters."""
    rows: list[dict[str, str]] = []
    for param in operation.get("parameters") or []:
        if not isinstance(param, dict):
            continue
        name = param.get("name", "")
        if name.lower() == "authorization":
            continue
        location = param.get("in", "")
        schema = param.get("schema") or {}
        rows.append(
            {
                "source": location,
                "name": name,
                "type": _schema_type_label(schema, components),
                "required": "yes" if param.get("required") else "no",
                "constraints": _schema_constraints(schema),
                "description": _clean_text(param.get("description") or ""),
            }
        )

    request_body = operation.get("requestBody")
    if isinstance(request_body, dict):
        required = "yes" if request_body.get("required") else "no"
        content = request_body.get("content", {}).get("application/json", {})
        body_schema = content.get("schema") or {}
        resolved = _resolve_schema(body_schema, components)
        if resolved.get("type") == "object" and resolved.get("properties"):
            req_fields = set(resolved.get("required") or [])
            for field, field_schema in resolved["properties"].items():
                rows.append(
                    {
                        "source": "body",
                        "name": field,
                        "type": _schema_type_label(field_schema, components),
                        "required": "yes" if field in req_fields else "no",
                        "constraints": _schema_constraints(field_schema),
                        "description": _clean_text(field_schema.get("description") or ""),
                    }
                )
        else:
            rows.append(
                {
                    "source": "body",
                    "name": "(json)",
                    "type": _schema_type_label(body_schema, components),
                    "required": required,
                    "constraints": "",
                    "description": _clean_text(
                        request_body.get("description") or "JSON request body"
                    ),
                }
            )
    return rows


def _render_response_schema(
    schema: dict[str, Any],
    components: dict[str, Any],
) -> list[str]:
    """Render success response fields."""
    resolved = _resolve_schema(schema, components)
    if resolved.get("type") == "array":
        item = resolved.get("items") or {}
        item_label = _schema_type_label(item, components)
        lines = [f"**HTTP 200:** array of `{item_label}`", ""]
        item_resolved = _resolve_schema(item, components)
        if item_resolved.get("properties"):
            lines.append("Each item:")
            lines.append("")
            lines.extend(_properties_table(item_resolved, components))
        elif "$ref" in item:
            ref_name = item["$ref"].split("/")[-1]
            lines.append(f"See component schema [`{ref_name}`](#{ref_name.lower()}).")
        return lines

    if resolved.get("properties"):
        ref_name = schema.get("$ref", "").split("/")[-1]
        title = ref_name or "object"
        lines = [f"**HTTP 200:** `{title}`", ""]
        lines.extend(_properties_table(resolved, components))
        if ref_name:
            lines.append("")
            lines.append(f"Full nested fields: [`{ref_name}`](#{ref_name.lower()}).")
        return lines

    return [f"**HTTP 200:** `{_schema_type_label(schema, components)}`", ""]


def _render_component_schema(
    name: str,
    schema: dict[str, Any],
    components: dict[str, Any],
) -> list[str]:
    """Render a component schema appendix entry."""
    lines = [f"### `{name}`", ""]
    resolved = _resolve_schema(schema, components)
    if not resolved.get("properties"):
        lines.append(f"Type: `{_schema_type_label(schema, components)}`")
        return lines
    lines.extend(_properties_table(resolved, components))
    return lines


def _properties_table(
    schema: dict[str, Any],
    components: dict[str, Any],
) -> list[str]:
    """Markdown table of object properties."""
    props = schema.get("properties") or {}
    if not props:
        return ["_(no properties)_"]
    required = set(schema.get("required") or [])
    lines = [
        "| Field | Type | Required | Description |",
        "|-------|------|----------|-------------|",
    ]
    for field, field_schema in props.items():
        resolved = _resolve_schema(field_schema, components)
        type_label = _schema_type_label(field_schema, components)
        lines.append(
            "| "
            + " | ".join(
                [
                    f"`{field}`",
                    type_label,
                    "yes" if field in required else "no",
                    _clean_text(
                        resolved.get("description") or field_schema.get("description") or ""
                    ),
                ]
            )
            + " |"
        )
    return lines


def _resolve_schema(schema: dict[str, Any], components: dict[str, Any]) -> dict[str, Any]:
    """Resolve a single ``$ref`` and shallow ``anyOf``."""
    if not schema:
        return {}
    if "$ref" in schema:
        ref = schema["$ref"]
        if ref.startswith("#/components/schemas/"):
            name = ref.split("/")[-1]
            target = components.get(name, {})
            merged = dict(target)
            merged.setdefault("description", schema.get("description"))
            return _resolve_schema(merged, components)
        return schema
    if "anyOf" in schema:
        for option in schema["anyOf"]:
            if option.get("type") != "null":
                return _resolve_schema(option, components)
    if "allOf" in schema:
        merged: dict[str, Any] = {"properties": {}, "required": []}
        for part in schema["allOf"]:
            part_resolved = _resolve_schema(part, components)
            merged["properties"].update(part_resolved.get("properties") or {})
            merged["required"] = list(
                set(merged.get("required") or []) | set(part_resolved.get("required") or [])
            )
            if "type" in part_resolved:
                merged["type"] = part_resolved["type"]
        return merged
    return schema


def _named_component_type(schema: dict[str, Any]) -> str | None:
    """Return a component schema name for direct or nullable ``$ref`` arms."""
    if "$ref" in schema:
        return schema["$ref"].split("/")[-1]
    for key in ("anyOf", "oneOf"):
        options = schema.get(key)
        if not isinstance(options, list):
            continue
        labels: list[str] = []
        for option in options:
            if not isinstance(option, dict) or option.get("type") == "null":
                continue
            if "$ref" in option:
                labels.append(option["$ref"].split("/")[-1])
            elif option.get("type") == "array":
                items = option.get("items") or {}
                if "$ref" in items:
                    ref_name = items["$ref"].split("/")[-1]
                    labels.append(f"array[{ref_name}]")
                else:
                    return None
            else:
                return None
        if len(labels) == 1:
            return labels[0]
    return None


def _schema_type_label(schema: dict[str, Any], components: dict[str, Any]) -> str:
    """Human-readable type for a JSON schema fragment."""
    named = _named_component_type(schema)
    if named:
        return named
    resolved = _resolve_schema(schema, components)
    if "$ref" in resolved:
        return resolved["$ref"].split("/")[-1]
    t = resolved.get("type")
    if t == "array":
        items = resolved.get("items") or {}
        return f"array[{_schema_type_label(items, components)}]"
    if t == "object":
        return "object"
    if t is None and "properties" in resolved:
        return "object"
    return str(t or "any")


def _schema_constraints(schema: dict[str, Any]) -> str:
    """Format common JSON Schema constraints."""
    parts: list[str] = []
    if "minimum" in schema:
        parts.append(f"min={schema['minimum']}")
    if "maximum" in schema:
        parts.append(f"max={schema['maximum']}")
    if schema.get("minLength") is not None:
        parts.append(f"minLength={schema['minLength']}")
    return ", ".join(parts)


def _clean_text(value: str) -> str:
    """Escape pipe characters for markdown tables."""
    return value.replace("|", "\\|").replace("\n", " ").strip()
