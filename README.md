# LaLiga Fantasy Builder

Monorepo for **LaLiga Fantasy Builder** (`laliga_fantasy_builder`).

Backend services are split so **auth can be deployed on its own**:

- [`backend/auth/`](backend/auth/) — authentication / LaLiga pairing service (`fantasy_auth`)
- [`backend/api/`](backend/api/) — main application API (`fantasy_api`; internal JWT consumer)
- [`frontend/`](frontend/) — Bun + TypeScript (reserved)
- [`docker/`](docker/) — Keycloak realm import
- [`assets/`](assets/) — public LALIGA snapshots / fixtures
- [`cli/`](cli/) — helper notes (CLIs ship from `backend/auth` via uv)

## Documentation

- [`docs/authentication.md`](docs/authentication.md) — authentication flows
  and security contract
- [`docs/architecture.md`](docs/architecture.md) — services, trust boundaries,
  persistence, and request flows
- [`docs/developing-authenticated-endpoints.md`](docs/developing-authenticated-endpoints.md)
  — patterns and tests for future endpoints

## Quick start (auth service)

```bash
# IdP
docker compose up -d

# Auth API
cd backend/auth
cp .env.example .env
export TOKEN_VAULT_KEY_BASE64=$(openssl rand -base64 32)
uv sync --all-extras
uv run uvicorn fantasy_auth.main:app --reload --port 8000
```

- App login: http://localhost:8000/auth/login (`demo` / `demo` on local Keycloak)
- Admin: http://localhost:8080 (`admin` / `admin`)

Optional: build/run auth in Docker (`docker compose --profile full up --build`).

## Pair LaLiga

```bash
export FANTASY_SESSION='…'
export FANTASY_CSRF='…'
cd backend/auth
uv run pair-laliga
```

## Auth flows

1. App login: `GET /auth/login` → IdP → `GET /auth/callback` sets
   `HttpOnly; Secure; SameSite` (default `Lax`, configurable via
   `COOKIE_SAMESITE`) session cookie plus CSRF token. App ID tokens are
   verified against `APP_OIDC_JWKS_URL` (signature, iss, aud, exp, nonce).
2. Pairing: `POST /laliga/pairings` (session + CSRF) returns one-time
   `{pairing_id, secret, nonce}` valid for 10 minutes.
3. Helper / `pair-laliga`: PKCE against LaLiga B2C, then complete pairing.
4. Backend verifies JWKS, confirms `GET /api/v4/user/me`, seals tokens (AES-GCM).
5. Cross-service: browser `POST /auth/token` → internal JWT; Fantasy API verifies
   JWKS and calls `GET /internal/laliga/bearer` with JWT + `X-Service-Token`.

No LALIGA passwords or ROPC. Prefer `access_token`; `id_token` fallback via
`LALIGA_ALLOW_ID_TOKEN_FALLBACK=true`.

## Why auth is separate

Auth is a BFF with different scaling, secrets, and release cadence than the
main Fantasy Builder API. Keeping it under `backend/auth/` (same monorepo,
own image) gives independent deploys without the overhead of a nested git
repository. If you later need a fully separate remote, extract `backend/auth`
to its own repo; the package boundary is already clean.

## Tests

```bash
cd backend/auth && uv run pytest
```
