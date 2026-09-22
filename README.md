# LaLiga Fantasy Builder

Monorepo for a **LaLiga Fantasy** companion API: league tables, squads, team
money and lineups, a player catalog, the league market, and buyout clauses,
proxied from Fantasy onto a stable OpenAPI surface.

## What it offers

| Area | You can |
|------|---------|
| **Leagues** | List your competitions, overall and week standings, activity, rival teams, and a squad |
| **Teams** | Read cash/investment, current and matchweek lineup, and optionally replace a lineup |
| **Players** | Browse the public catalog and market-value history; open a league-contextual player card |
| **Calendar** | Read the current matchday, fixtures, and matchweek stats |
| **Market** | Read league market and history; manage bids, listings, and offers via API |
| **Buyout** | Check shield status; pay or increase a clause and activate shielding via API |

Interactive docs: http://localhost:8001/docs (Swagger) once the API is running.
Feature notes: [leagues](docs/api/leagues/README.md),
[teams](docs/api/teams/README.md), [players](docs/api/players/README.md),
[calendar](docs/api/calendar/README.md), [market](docs/api/market/README.md),
[buyout](docs/api/buyout/README.md).

Local CLIs (call the API, not Fantasy directly):

```bash
cd backend/api
uv run fantasy-leagues --json          # ranking, week standing, activity, squads
uv run fantasy-teams --week 5          # money + lineup
uv run fantasy-players --player-id 7   # catalog / market value (public)
uv run fantasy-calendar --week 8 --json
uv run fantasy-market --league-id 123 --json
uv run fantasy-buyout --league-id 123 --player-team-id pt-9 --json
```

Signed-in analysis (Keycloak demo user, then LaLiga consent in your browser):

```bash
cd backend/auth
uv run fantasy-browser-session leagues-analysis --json
uv run fantasy-browser-session teams-analysis --json
uv run fantasy-browser-session market-analysis --json
uv run fantasy-browser-session buyout-analysis \
  --league-id 123 --player-team-id pt-9 --json
```

Catalog and market-value reads need no login. League, team, league-card,
market, and buyout routes need a paired LaLiga account. Calendar reads need
an internal JWT; Fantasy itself is public for those paths. `fantasy-market`
and `fantasy-buyout` are read-only.

## Quick start

Docker (Keycloak + auth + API):

```bash
cp .env.template .env
cp backend/auth/.env.example backend/auth/.env
cp backend/api/.env.example backend/api/.env
docker compose --profile apps up --build
```

- API: http://localhost:8001/docs
- App login: http://localhost:8000/auth/login (`demo` / `demo`)
- Keycloak admin: http://localhost:8080 (`admin` / `admin`)

Production-like extras (Postgres, Redis, OTEL): set `USE_MEMORY_STORE=false`,
vault key, and JWT PEMs in `backend/auth/.env`, then
`docker compose --profile full up --build`.

Without Compose, run both services with `uv` (Keycloak still via
`docker compose up -d`):

```bash
cd backend/auth && uv sync --all-extras && uv run uvicorn fantasy_auth.main:app --reload --port 8000
cd backend/api  && uv sync --all-extras && uv run uvicorn fantasy_api.main:app --reload --port 8001
```

Login and pairing details: [`backend/auth/README.md`](backend/auth/README.md).

## Repository

| Path | Role |
|------|------|
| [`backend/api/`](backend/api/) | Application API (`fantasy_api`) — leagues, teams, players, calendar, market, buyout |
| [`backend/auth/`](backend/auth/) | Login, sessions, LaLiga pairing (deployable on its own) |
| [`docs/`](docs/) | Architecture, API, and auth documentation |
| [`docker/`](docker/) | Keycloak realm import |
| [`assets/`](assets/) | Sample Fantasy payloads |
| [`frontend/`](frontend/) | Lineup UI (Bun, Vite, React, TypeScript). `cd frontend && bun install && bun run dev` |

## Documentation

- [`AGENTS.md`](AGENTS.md) — instructions for coding agents
- [`docs/README.md`](docs/README.md) — index
- [`docs/api/`](docs/api/) — routes, OpenAPI, adding endpoints
- [`docs/architecture.md`](docs/architecture.md) — services and request flows
- [`docs/authentication/`](docs/authentication/) — how login and pairing work

## Tests

```bash
cd backend/api && uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80
cd backend/auth && uv run pytest
```
