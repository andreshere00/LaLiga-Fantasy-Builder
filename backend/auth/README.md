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

```bash
export FANTASY_SESSION='…'
export FANTASY_CSRF='…'
cd backend/auth
uv run pair-laliga
```

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
