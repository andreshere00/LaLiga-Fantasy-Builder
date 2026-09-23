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

## Health

- `GET /health` and `GET /health/live` — process liveness
- `GET /health/ready` — Postgres and Redis when `USE_MEMORY_STORE=false`
- `GET /.well-known/jwks.json` — internal JWT verification keys
- `POST /auth/token` — session and CSRF to a short-lived internal JWT
- `GET /internal/laliga/bearer` — private; JWT plus `X-Service-Token`

`/internal/*` must not be exposed on the public internet.

## Tests

```bash
cd backend/auth && uv run pytest
```
