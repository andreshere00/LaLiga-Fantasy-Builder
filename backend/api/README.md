# API service

Fantasy routes for the lineup app and the CLIs. Callers send an internal JWT
from auth. LaLiga bearers are fetched in private and never returned.
The request path is in [Architecture](../../docs/architecture.md).

## Local run

```bash
cd backend/api
cp .env.example .env
uv sync --all-extras
uv run uvicorn fantasy_api.main:app --reload --port 8001
```

From the repo root, with auth on the Compose network:
`docker compose --profile apps up --build` ([root README](../../README.md)).

Standalone image:

```bash
docker build -t laliga-fantasy-builder-api -f backend/api/Dockerfile backend/api
docker run --rm -p 8001:8001 --env-file backend/api/.env laliga-fantasy-builder-api
```

Set `AUTH_JWKS_URL` and `AUTH_INTERNAL_BASE_URL` when not using Compose.
`LALIGA_FANTASY_ORIGIN` defaults to `https://fantasy-api.llt-services.com`.
`LALIGA_COMPETITION_ID` defaults to `1`.

## Routes

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/me` | App identity from the internal JWT |
| `GET` | `/laliga/credential-probe` | Bearer available, token redacted |
| `GET` | `/laliga/leagues-probe` | Fantasy leagues connectivity, redacted |
| `GET` | `/leagues...` | [leagues](../../docs/api/leagues/README.md) |
| `GET`/`PUT` | `/teams...` | [teams](../../docs/api/teams/README.md) |
| `GET` | `/players...` | [players](../../docs/api/players/README.md). Catalog and history are public |
| `GET` | `/calendar/...` | Matchday, fixtures, stats. JWT required; Fantasy read is public |
| `GET`/`POST`/… | `/market/...` | [market](../../docs/api/market/README.md) |
| `GET`/`POST`/`PUT` | `/buyout/...` | [buyout](../../docs/api/buyout/README.md) |

New routes: [Adding endpoints](../../docs/api/adding-endpoints.md).
Swagger: http://localhost:8001/docs. Regenerate with
`uv run poe generate-openapi` ([details](../../docs/api/openapi.md)).

## CLI

Auth on port 8000 and this API on port 8001. Pass `--jwt` or
`FANTASY_SESSION` and `FANTASY_CSRF`.

```bash
cd backend/api
uv run fantasy-leagues --league-id 123 --week 5 --json
uv run fantasy-teams --team-id 99 --week 5
uv run fantasy-players --player-id 7 --league-id 42
uv run fantasy-calendar --week 8 --json
uv run fantasy-market --league-id 123 --json
uv run fantasy-buyout --league-id 123 --player-team-id pt-9 --json
```

Signed-in analysis from auth: `uv run fantasy-browser-session leagues-analysis`.
`fantasy-market` and `fantasy-buyout` are read-only.

## Tests

```bash
cd backend/api && uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80
```
