# LaLiga Fantasy Builder

Companion for a LaLiga Fantasy league: edit your lineup and manage market
bids from the browser, backed by a small API that proxies Fantasy reads and
writes with your linked account.

![Lineup screen](docs/images/lineup.png)

| Topic | Doc |
|-------|-----|
| Architecture and trust boundaries | [docs/architecture.md](docs/architecture.md) |
| UI behaviour (lineup + market) | [docs/frontend.md](docs/frontend.md) |
| API routes and CLIs | [docs/api/README.md](docs/api/README.md) |
| Agent / contributor rules | [AGENTS.md](AGENTS.md) |

## Main features

### Lineup (`/`)

- Sign in with Keycloak, link LaLiga once, pick a league from the shell.
- View matchweek standings and open another manager’s team via `/?team={teamId}`.
- Change formation and save the full lineup to Fantasy.
- Squad panel with pagination, fixture scores, and squad value in the toolbar.

### Market (`/market`)

- League market table: players, form, availability, seal countdown, and sellers.
- **Money toolbar** with a warning when balance is negative before matchday.
- **Bids:** hire LaLiga listings, purchase opponent listings, modify or cancel
  your bids; UI reflects `userBids` and listing `bid` state with optimistic
  updates and refetch reconciliation.
- **Release clauses:** pay opponent buyouts when unlocked (confirmed dialog);
  tooltips explain lock countdown or premium-only coach hires.
- **Hover detail:** FSYP breakdown, market-value history (high/low and 5d/14d
  ago with %), bid amounts, balance and clause warnings.
- **Seal end** turns red when less than one hour remains on a listing.

### Platform

- **Auth BFF** (`backend/auth`): sessions, OIDC, LaLiga vault, internal JWT.
- **API** (`backend/api`): leagues, teams, players, calendar, market,
  buyout — OpenAPI at http://localhost:8001/docs when running locally.
- **Read-only CLIs** for market and buyout analysis; no automated bidding or
  clause payment in CLI or browser-session flows.

## Quick start

`poe up` creates missing env files, then builds and starts Keycloak, auth,
the API, and the frontend:

```bash
uv run poe up
```

- App: http://localhost:3000 (`demo` / `demo`). First LaLiga link on macOS may
  need `cd backend/auth && uv run fantasy-browser-session` and allowing
  LaligaAuthredirect.
- API docs: http://localhost:8001/docs
- Keycloak admin: http://localhost:8080 (`admin` / `admin`)

Postgres, Redis, and OpenTelemetry: set `USE_MEMORY_STORE=false`, vault key,
and JWT PEMs in `backend/auth/.env`, then
`docker compose --profile full up --build`.

**Services on the host (Vite HMR):**

```bash
docker compose up -d keycloak
uv run poe dev
```

From `frontend/` only: `bun install && bun run dev:all` (or `npm`).

Per-service notes: [auth](backend/auth/README.md), [API](backend/api/README.md).

## Repository

| Path | Role |
|------|------|
| [`frontend/`](frontend/) | React lineup and market UI |
| [`backend/auth/`](backend/auth/) | Sessions, Keycloak, LaLiga pairing, internal JWT |
| [`backend/api/`](backend/api/) | Fantasy proxy routes and CLIs |
| [`docs/`](docs/) | Architecture, authentication, API domain guides |
| [`docker/`](docker/) | Keycloak realm import, OTEL collector |
| [`assets/`](assets/) | Sample Fantasy JSON trees |

## Tests

```bash
uv run poe test
```

Frontend only: `cd frontend && bun run test`. Hooks lint (also a pre-commit and CI step):
`cd frontend && bun run lint`.
