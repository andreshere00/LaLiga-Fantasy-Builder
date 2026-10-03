# Auth service

Application login (Keycloak) and the sealed LaLiga account. The browser flow
is in [Architecture](../../docs/architecture.md#browser-login). Token rules
are in [Authentication](../../docs/authentication/authentication.md).

Package import path: `fantasy_auth`. Stack startup is the
[root README](../../README.md).

## Local run

```bash
cd backend/auth
cp .env.example .env
uv sync --all-extras
uv run uvicorn fantasy_auth.main:app --reload --port 8000
```

Keycloak, from the repo root: `docker compose up -d`.

Standalone image:

```bash
docker build -t laliga-fantasy-builder-auth -f backend/auth/Dockerfile backend/auth
docker run --rm -p 8000:8000 --env-file backend/auth/.env laliga-fantasy-builder-auth
```

## Developer pairing CLIs

The app pairs LaLiga itself. These commands are for analysis and for
registering the macOS `authredirect://` handler.

```bash
cd backend/auth
uv sync --extra browser
uv run playwright install chromium
uv run fantasy-browser-session leagues-analysis --json
```

Allow LaligaAuthredirect if macOS asks. `--no-pair` skips LaLiga when you
only need an internal JWT. `--exports` prints session cookies and
`INTERNAL_JWT` for curl.

`leagues-analysis`, `teams-analysis`, `market-analysis`, and
`buyout-analysis` call the matching API reads. `fantasy-market` and
`fantasy-buyout` stay read-only. `--put-lineup` needs a real JSON file and
`--team-id`.

Cookie-prompt alternative, from the repo root: `./scripts/authenticate-laliga.sh`.
Against an auth process that is already up:

```bash
export FANTASY_SESSION='…'
export FANTASY_CSRF='…'
cd backend/auth && uv run pair-laliga
```

## Routes and OpenAPI

Full route tables: [Auth endpoints](../../docs/authentication/endpoints.md).
Regenerate committed schema: `uv run generate-openapi` (writes
`backend/auth/openapi.json`). Swagger: http://localhost:8000/docs when running.

Highlights:

- `GET /health`, `/health/live`, `/health/ready` — liveness/readiness
- `GET /auth/login`, `/auth/callback`, `/auth/me`, `POST /auth/logout` — app session
- `POST /auth/token` — session + CSRF → internal JWT
- `GET /laliga/connection`, `DELETE /laliga/connection` — link status / unlink
- LaLiga pairing under `/laliga/pairings*`
- `GET /.well-known/jwks.json` — internal JWT verification keys
- `GET /internal/laliga/bearer` — private; JWT plus `X-Service-Token`

`/internal/*` must not be exposed on the public internet.

## Tests

```bash
cd backend/auth && uv run pytest
```
