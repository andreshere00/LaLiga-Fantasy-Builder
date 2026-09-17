# LaLiga Fantasy Builder — Auth service

Standalone FastAPI service for **application identity** (Keycloak/OIDC) and
**LaLiga Fantasy delegation** (pairing + sealed B2C tokens). Deploy this
service independently from the future main API / frontend.

Python package import path: `fantasy_auth`.

## Local run

```bash
cd backend/auth
cp .env.example .env
# set TOKEN_VAULT_KEY_BASE64=$(openssl rand -base64 32)
uv sync --all-extras
uv run uvicorn fantasy_auth.main:app --reload --port 8000
# or: uv run laliga-fantasy-builder-auth
```

From repo root, Keycloak:

```bash
docker compose up -d
```

Production-like local stack (Postgres + Redis + auth + optional OTEL):

```bash
docker compose --profile full up --build
```

## Docker

```bash
# from repo root
docker build -t laliga-fantasy-builder-auth -f backend/auth/Dockerfile backend/auth
docker run --rm -p 8000:8000 --env-file backend/auth/.env laliga-fantasy-builder-auth
```

## Pair LaLiga

From the repository root, use the automated script:

```bash
./scripts/authenticate-laliga.sh
```

Or run its CLI directly:

```bash
cd backend/auth
uv run authenticate-laliga
```

The command creates `.env` when missing, starts local Keycloak, synchronizes
dependencies, starts auth when needed, opens application login, performs the
LaLiga PKCE pairing, and verifies `/laliga/connection`.

The browser login and consent screens cannot be safely automated. After app
login, copy `fantasy_session` and `fantasy_csrf` from browser developer tools
when prompted. Cookie values are read without terminal echo.

When the command starts an in-memory auth server, it keeps that process alive
after pairing so the connection remains available. Press `Ctrl+C` to stop it.
Use `--no-keep-server` only when the connection is persisted elsewhere.

To pair against an auth service that is already running:

```bash
export FANTASY_SESSION='…'
export FANTASY_CSRF='…'
cd backend/auth
uv run pair-laliga
```

## Browser session (Playwright)

Local Keycloak login (`demo` / `demo`) can be driven by Chromium so you do not
copy cookies by hand. When the vault is empty, pairing opens your **default
browser** so you can sign in to LaLiga with Google. The native
`authredirect://` callback is captured by a small helper app — do not copy or
paste it. macOS may ask to open **LaligaAuthredirect**; choose Open.

```bash
cd backend/auth
uv sync --extra browser
uv run playwright install chromium

# Auth on :8000, API on :8001, Keycloak on :8080
uv run fantasy-browser-session --exports
uv run fantasy-browser-session --player-id 3277 --json
uv run fantasy-browser-session leagues-analysis --json
uv run fantasy-browser-session teams-analysis --json
```

From the repo root: `./scripts/fantasy-browser-session.sh leagues-analysis`.

`leagues-analysis` calls `GET /leagues`, standing (overall and week), activity,
teams, and a squad. `teams-analysis` calls `GET /teams/{id}/money`, current
lineup, and week lineup. `--put-lineup` is optional and must point at a real
JSON file plus a real `--team-id` (not a placeholder). `--week` defaults to
the jornada inferred from `/leagues`. `--headless` hides the Keycloak window.
LaLiga pairing uses your normal browser. `--no-pair` skips LaLiga if you only
need a JWT. `--exports` prints `FANTASY_SESSION` / `FANTASY_CSRF` /
`INTERNAL_JWT` for curl.

## Health

- `GET /health` / `GET /health/live` — process liveness
- `GET /health/ready` — Postgres + Redis when `USE_MEMORY_STORE=false`
- `GET /.well-known/jwks.json` — public keys for internal JWT verification
- `POST /auth/token` — session+CSRF → short-lived internal JWT
- `GET /internal/laliga/bearer` — private; JWT + `X-Service-Token` → LaLiga bearer

`/internal/*` must not be exposed on the public internet.

## Tests

```bash
cd backend/auth && uv run pytest
```
