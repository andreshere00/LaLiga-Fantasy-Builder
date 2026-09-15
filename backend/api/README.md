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

### Fantasy settings

| Variable | Default | Purpose |
|----------|---------|---------|
| `LALIGA_FANTASY_ORIGIN` | `https://fantasy-api.llt-services.com` | Fantasy API origin |
| `LALIGA_COMPETITION_ID` | `1` | Competition id in Fantasy paths |

## Routes

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/me` | App identity from internal JWT |
| `GET` | `/laliga/credential-probe` | Auth bearer available (token redacted) |
| `GET` | `/laliga/leagues-probe` | Fantasy leagues connectivity (redacted) |
| `GET` | `/leagues` | Competition leagues |
| `GET` | `/leagues/{league_id}/standing` | Overall standing |
| `GET` | `/leagues/{league_id}/standing/{week}` | Week standing |
| `GET` | `/leagues/{league_id}/activity/{page}` | Paginated activity (`page` usually starts at `0`) |
| `GET` | `/leagues/{league_id}/teams` | Teams/managers |
| `GET` | `/leagues/{league_id}/teams/{team_id}` | Team roster and clauses |

Leagues endpoints are a thin authenticated proxy of LaLiga Fantasy. Layout:

`api/leagues.py` → `services/leagues.py` → `repositories/leagues.py` →
`clients/laliga_fantasy.py`.

See [`docs/api/leagues/`](../../docs/api/leagues/) for leagues docs and
[`docs/api/openapi.md`](../../docs/api/openapi.md) for OpenAPI/Swagger.
Use `uv run fantasy-leagues` for a local CLI summary (ranking, week standing,
activity, teams).

## Live connectivity check

With auth running, a paired LaLiga connection, and an internal JWT:

```bash
# After POST /auth/token against auth (port 8000):
curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  http://localhost:8001/laliga/leagues-probe
```

Expected JSON shape: `{"ok": true, "league_count": N, "league_ids": [...]}`.
The LaLiga bearer must never appear in the response.

## CLI: fantasy-leagues

Fetches leagues, overall standing (with your position), last-week standing,
activity, teams, and your squad via this API.

```bash
cd backend/api
uv sync --all-extras

# Option A — session cookies (exchanges /auth/token for you)
export FANTASY_SESSION='…'
export FANTASY_CSRF='…'
uv run fantasy-leagues

# Option B — already minted JWT
export INTERNAL_JWT='…'
uv run fantasy-leagues --jwt "$INTERNAL_JWT"

# Useful flags
uv run fantasy-leagues --league-id 123 --week 5 --json
```

Requires auth on `:8000` and this API on `:8001` (overridable with
`--auth-base` / `--api-base`). If week is omitted, the CLI tries to infer
the current/última jornada from the leagues or standing payload.

## OpenAPI / Swagger

While the API is running, interactive docs are at:

- Swagger UI: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc
- Live schema: http://localhost:8001/openapi.json

Input/output models live under `src/fantasy_api/schemas/`. Route docstrings
and `response_model` annotations drive the Swagger schema. Regenerate the
committed document (same content as `/openapi.json`) with:

```bash
cd backend/api
uv run generate-openapi                 # writes ./openapi.json
uv run generate-openapi --stdout        # print only
```

From the repo root, pre-commit runs the same generation via
`uv run poe generate-openapi` when API sources change.

Programmatic API: `fantasy_api.openapi.generate_openapi()` /
`build_openapi_schema(app)`.

## Tests

```bash
cd backend/api && uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80
```
