# LaLiga Fantasy Builder — API service

Main application API. Authenticates callers with **internal JWTs** from
[`../auth/`](../auth/) and fetches short-lived LaLiga bearers from auth’s
private credential endpoint. Never opens the token vault.

## Contract

1. Browser authenticates with auth cookies, then `POST /auth/token` (CSRF).
2. Caller sends `Authorization: Bearer <internal JWT>`.
3. This API verifies the JWT against auth JWKS (`AUTH_JWKS_URL`).
4. LaLiga routes call `GET /internal/laliga/bearer` with the same JWT plus
   `X-Service-Token` (never exposed to the browser).

`/internal/*` on auth must stay on a private network.

## Local run

```bash
cd backend/api
cp .env.example .env
uv sync --all-extras
uv run uvicorn fantasy_api.main:app --reload --port 8001
```

## Docker

From repo root (with auth on the same Compose network):

```bash
cp backend/api/.env.example backend/api/.env
docker compose --profile apps up --build
```

Standalone image (multi-stage `python:3.14-slim-trixie`, non-root):

```bash
docker build -t laliga-fantasy-builder-api -f backend/api/Dockerfile backend/api
docker run --rm -p 8001:8001 --env-file backend/api/.env laliga-fantasy-builder-api
```

Set `AUTH_JWKS_URL` and `AUTH_INTERNAL_BASE_URL` to a reachable auth instance
when not using Compose defaults.

| Variable | Default | Purpose |
|----------|---------|---------|
| `LALIGA_FANTASY_ORIGIN` | `https://fantasy-api.llt-services.com` | Fantasy origin |
| `LALIGA_COMPETITION_ID` | `1` | Competition id in Fantasy paths |

## Routes

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/me` | App identity from internal JWT |
| `GET` | `/laliga/credential-probe` | Auth bearer available (token redacted) |
| `GET` | `/laliga/leagues-probe` | Fantasy leagues connectivity (redacted) |
| `GET` | `/leagues...` | See [leagues](../../docs/api/leagues/README.md) |
| `GET`/`PUT` | `/teams...` | See [teams](../../docs/api/teams/README.md) |
| `GET` | `/players...` | See [players](../../docs/api/players/README.md) (catalog/history public) |

CRS: `api/` → `services/` → `repositories/` → `clients/laliga_fantasy.py`.
New routes: [Adding endpoints](../../docs/api/adding-endpoints.md).
OpenAPI: http://localhost:8001/docs — regenerate with
`cd backend/api && uv run generate-openapi` ([details](../../docs/api/openapi.md)).

Probe (bearer must not appear):

```bash
curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  http://localhost:8001/laliga/leagues-probe
```

## CLI

Requires auth on `:8000` and this API on `:8001` (`--auth-base` / `--api-base`).
JWT via `--jwt` / `INTERNAL_JWT`, or `FANTASY_SESSION` + `FANTASY_CSRF`.

```bash
cd backend/api
uv run fantasy-leagues --league-id 123 --week 5 --json
uv run fantasy-teams --team-id 99 --week 5
uv run fantasy-players --player-id 7 --league-id 42
```

Automated Keycloak + LaLiga pairing (from `backend/auth`):
`uv run fantasy-browser-session leagues-analysis`.

## Tests

```bash
cd backend/api && uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80
```
