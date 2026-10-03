# Auth OpenAPI / Swagger

The auth service exposes OpenAPI 3 from FastAPI for local exploration and
committed schema review.

## View docs

With auth on port 8000:

| Surface | URL |
|---------|-----|
| Swagger UI | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |
| Live OpenAPI | http://localhost:8000/openapi.json |
| Committed schema | [`backend/auth/openapi.json`](../../backend/auth/openapi.json) |

Human route tables and request/response fields:
[Auth endpoints](endpoints.md).

## What drives the schema

| Source | Role |
|--------|------|
| Route signatures and `response_model` | Documented response shapes |
| Path / header parameters | Parameter docs |
| Endpoint docstrings | Operation summaries |
| Pydantic models on pairing and token routes | Component schemas |

Session-only routes (`GET /auth/me`, cookie login) appear in OpenAPI but
**security is cookie-based**, not Bearer. Only `/internal/laliga/bearer` uses
the internal JWT in the `Authorization` header.

## Regenerate the committed document

```bash
cd backend/auth
uv run generate-openapi
# uv run generate-openapi --stdout
# uv run generate-openapi -o /tmp/auth-openapi.json
```

Commit `backend/auth/openapi.json` when routes or response models change.

Pre-commit hook `generate-openapi` (see [API OpenAPI](../api/openapi.md#pre-commit))
also checks auth alignment when auth sources are staged. CI runs
`bash scripts/check-openapi-alignment.sh`.

Implementation: `fantasy_auth.openapi.generate_openapi` builds an in-memory
app (`use_memory_store=true`) so Postgres/Redis are not required for export.

## Fantasy API OpenAPI

Feature routes live in `backend/api`. See
[API OpenAPI / Swagger](../api/openapi.md).
