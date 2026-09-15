# LaLiga Fantasy Builder — API service

Main application API. Authenticates callers with **internal JWTs** minted by
[`../auth/`](../auth/) and fetches short-lived LaLiga bearers from auth’s
private credential endpoint. Never opens the token vault.

## Contract

1. Browser authenticates with auth cookies, then `POST /auth/token` (CSRF).
2. Browser (or BFF) calls this API with `Authorization: Bearer <internal JWT>`.
3. This API verifies the JWT against auth JWKS (`AUTH_JWKS_URL`).
4. For LaLiga calls, this API calls `GET /internal/laliga/bearer` with the same
   JWT plus `X-Service-Token` (never exposed to the browser).

`/internal/*` on auth must stay on a private network.

## Local run

```bash
cd backend/api
cp .env.example .env
uv sync --all-extras
uv run uvicorn fantasy_api.main:app --reload --port 8001
```

## Tests

```bash
cd backend/api && uv run pytest
```
