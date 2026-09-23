# LaLiga Fantasy Builder

Companion for a LaLiga Fantasy league: a lineup screen in the browser, and an
API that reads squads, standings, the market, and buyout clauses from Fantasy.

How the pieces fit together: [Architecture](docs/architecture.md).

## Quick start

`poe up` creates any missing env files, then builds and starts Keycloak, auth,
the API, and the frontend:

```bash
uv run poe up
```

- App: http://localhost:3000 (`demo` / `demo`). An account that is not linked
  continues to LaLiga and returns here. The first time on a Mac, run
  `cd backend/auth && uv run fantasy-browser-session` once and allow
  LaligaAuthredirect if macOS asks.
- API docs: http://localhost:8001/docs
- Keycloak admin: http://localhost:8080 (`admin` / `admin`)

Postgres, Redis, and OpenTelemetry: set `USE_MEMORY_STORE=false`, the vault
key, and the JWT PEMs in `backend/auth/.env`, then
`docker compose --profile full up --build`.

To run a service on the host instead of in Compose, use that service README:
[auth](backend/auth/README.md), [API](backend/api/README.md). Keycloak still
comes from `docker compose up -d`. The UI dev server is
`cd frontend && bun install && bun run dev`.

## Repository

| Path | Role |
|------|------|
| [`frontend/`](frontend/) | Lineup UI. Talks to auth and the API through the same origin |
| [`backend/auth/`](backend/auth/) | Sessions, Keycloak login, LaLiga vault, internal JWT |
| [`backend/api/`](backend/api/) | Fantasy routes and the read-only CLIs |
| [`docs/`](docs/) | Architecture, authentication, and per-domain API notes |
| [`docker/`](docker/) | Keycloak realm import and the OTEL collector config |
| [`assets/`](assets/) | Sample Fantasy payloads |

Route catalogs, OpenAPI, and CLI flags: [API docs](docs/api/README.md).
Agent instructions: [`AGENTS.md`](AGENTS.md).

## Tests

```bash
uv run poe test
```
