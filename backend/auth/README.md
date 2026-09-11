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

## Docker

```bash
# from repo root
docker build -t laliga-fantasy-builder-auth -f backend/auth/Dockerfile backend/auth
docker run --rm -p 8000:8000 --env-file backend/auth/.env laliga-fantasy-builder-auth
```

Or via compose service `auth` (see root `docker-compose.yml`).

## Pair LaLiga

```bash
export FANTASY_SESSION='…'
export FANTASY_CSRF='…'
cd backend/auth
uv run pair-laliga
```

## Tests

```bash
cd backend/auth && uv run pytest
```
