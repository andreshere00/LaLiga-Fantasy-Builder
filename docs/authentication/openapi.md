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

Better Auth owns `/auth/*` and documents its endpoints separately in
[Identity](../../backend/identity/README.md). Python LaLiga starts, reads, deletes
and private bearer exchanges require an application Bearer JWT. Private routes
also require `X-Service-Token`; native/helper completion uses its own one-time
challenge. Python no longer accepts application session cookies.

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
