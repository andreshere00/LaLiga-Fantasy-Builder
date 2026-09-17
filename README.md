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

- [`docs/README.md`](docs/README.md) — documentation index
- [`docs/authentication/`](docs/authentication/) — auth flows and endpoint patterns
- [`docs/api/`](docs/api/) — Fantasy Builder API, OpenAPI/Swagger, features
- [`docs/architecture.md`](docs/architecture.md) — services, trust boundaries,
  persistence, and request flows

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

Docker (Keycloak + auth + API on slim Python 3.14 images):

```bash
cp backend/auth/.env.example backend/auth/.env
cp backend/api/.env.example backend/api/.env
docker compose --profile apps up --build
```

- Auth: http://localhost:8000 — API: http://localhost:8001/docs
- Production-like stack (Postgres + Redis + OTEL): set `USE_MEMORY_STORE=false`,
  vault key, and JWT PEMs in `backend/auth/.env`, then
  `docker compose --profile full up --build`

## Pair LaLiga

Preferred (Keycloak login automated; LaLiga consent in your browser):

```bash
cd backend/auth
uv run fantasy-browser-session --exports
```

Cookie-prompt alternative: `./scripts/authenticate-laliga.sh`. Details:
[`backend/auth/README.md`](backend/auth/README.md) and
[Authentication](docs/authentication/authentication.md).

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
