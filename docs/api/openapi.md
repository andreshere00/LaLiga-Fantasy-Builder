# OpenAPI / Swagger

The Fantasy Builder API exposes an OpenAPI 3.1 document that powers Swagger UI
and ReDoc. The live schema and the committed file are produced by the same
generator so they stay in sync.

## View docs

With the API running on port 8001:

| Surface | URL |
|---------|-----|
| Swagger UI | http://localhost:8001/docs |
| ReDoc | http://localhost:8001/redoc |
| Raw OpenAPI JSON | http://localhost:8001/openapi.json |

Protected operations declare **HTTP Bearer** security (internal JWT,
audience `fantasy-api`).

## What drives the schema

| Source | Role |
|--------|------|
| Route `response_model` / `responses` | Output (and error) schemas in Swagger |
| Path / header `Path` / `Header` descriptions | Parameter docs |
| Endpoint docstrings | Summary (first line) + description body |
| `fantasy_api.schemas.*` | Pydantic models registered as components |
| `fantasy_api.openapi.build_openapi_schema` | Tags, Bearer scheme, shared errors |

Pydantic models live under `fantasy_api.schemas`. Generation:
`fantasy_api.openapi.build_openapi_schema`.

After regenerating `openapi.json`, refresh the human-readable route reference:

```bash
uv run poe generate-endpoint-schemas
# or: cd backend/api && uv run generate-endpoint-schemas
```

## Regenerate the committed document

```bash
cd backend/api
uv sync --all-extras
uv run generate-openapi                 # writes backend/api/openapi.json
uv run generate-openapi -o /tmp/out.json
uv run generate-openapi --stdout        # print only
```

From the repo root (same command used by pre-commit):

```bash
uv run poe generate-openapi
# equivalent: bash scripts/generate-openapi.sh
```

### Pre-commit

The local hook `generate-openapi` runs when **API, auth or scraping** route/schema
sources, package metadata or committed `openapi.json` files are staged. It regenerates all three
schemas via `scripts/check-openapi-alignment.sh` and **fails the commit if a
file changed**, so you can review and stage updates before committing again.

For a version bump, align the root and service Python package versions and
lockfiles, the FastAPI application versions, Auth's `__version__`, and the
scraper User-Agent prefix. Regenerate all three OpenAPI files and the endpoint
reference with the root `generate-openapi`, `generate-auth-openapi`,
`generate-scraping-openapi`, and `generate-endpoint-schemas` Poe tasks, then run
`uv run poe check-openapi`. Date the changelog release and update the README links
before tagging the release commit.

Install hooks once:

```bash
uv run poe install
# or: uv run pre-commit install
```

Programmatic:

```python
from fantasy_api.openapi import generate_openapi, build_openapi_schema
from fantasy_api.main import create_app

schema = generate_openapi(output="openapi.json")
# or
schema = build_openapi_schema(create_app())
```

Commit an updated `openapi.json` whenever you add or change public routes or
response models.

## Checklist when adding an endpoint

1. Add or reuse a Pydantic model under `fantasy_api.schemas`.
2. Set `response_model=...` (and `responses=ERROR_RESPONSES` for protected
   routes).
3. Document path/query/header parameters with descriptions.
4. Keep a Google-style docstring on the handler (`Args` / `Returns`).
5. Run `uv run generate-openapi` (or rely on the pre-commit hook) and commit
   `openapi.json` if it changed.
6. Run `uv run generate-endpoint-schemas` and commit
   [`docs/api/endpoint-schemas.md`](endpoint-schemas.md) if it changed.
7. Confirm the operation appears under http://localhost:8001/docs and in
   [Endpoint schemas](endpoint-schemas.md).

For proxy-specific Swagger mistakes (docstring leakage, missing 503, CLI text in
`Path` descriptions), see [Proxy endpoint pitfalls](proxy-endpoint-pitfalls.md).

## Sample response shapes

Captured Fantasy payloads used to refine schemas:

- [`assets/leagues_info_structure.json`](../../assets/leagues_info_structure.json)
  — key/type structure extracted from a CLI leagues dump
