# LaLiga Fantasy Builder

Companion for a LaLiga Fantasy league: edit your lineup, browse player profiles,
and manage market bids from the browser, backed by an API that proxies Fantasy
data and user-confirmed writes with your linked account.

| Topic | Doc |
|-------|-----|
| Changes in v0.1.0 | [CHANGELOG.md](CHANGELOG.md) |
| Backend, frontend, and cloud architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Detailed service trust boundaries | [docs/architecture.md](docs/architecture.md) |
| Google Cloud Terraform deployment | [infra/gcp/README.md](infra/gcp/README.md) |
| UI behaviour (lineup, market, players) | [docs/frontend.md](docs/frontend.md) |
| API routes and CLIs | [docs/api/README.md](docs/api/README.md) |
| Agent / contributor rules | [AGENTS.md](AGENTS.md) |

## Main features

### Lineup (`/`)

- Sign in with Better Auth, link LaLiga once, pick a league from the shell.
- View matchweek standings and open another manager’s team via `/?team={teamId}`.
- Change formation and save the full lineup to Fantasy.
- Squad panel with pagination, fixture scores, and squad value in the toolbar.

### Market (`/market`)

- League market table: players, form, availability, seal countdown, and sellers.
- **Money toolbar** with a warning when balance is negative before matchday.
- **Bids:** hire LaLiga listings, purchase opponent listings, modify or cancel
  your bids; UI reflects `userBids` and listing `bid` state with optimistic
  updates and refetch reconciliation.
- **Received offers:** review, accept, or reject incoming offers from the
  notification panel on the market screen, or from a player's Options menu on
  market, lineup, and Players screens.
- **Release clauses:** pay opponent buyouts when unlocked (confirmed dialog);
  tooltips explain lock countdown or premium-only coach hires.
- **Hover detail:** FSYP breakdown, market-value history (high/low and 5d/14d
  ago with %), bid amounts, balance and clause warnings.
- **Seal end** turns red when less than one hour remains on a listing.

### Players (`/players`)

- Browse the player catalog with search, column filters, pagination, ownership,
  availability, position, and recent form.
- Use row actions for market operations and player details; bookmark players
  for quick identification.
- Open a profile for recent and upcoming fixtures, match conditions and
  countdowns, Fantasy indicators, per-match averages, news, and injury history.
- On narrow screens the table keeps the player photo, name, team, and details
  actions visible.

### Platform

- **Identity** (`backend/identity`): Better Auth login, recovery, sessions and JWTs.
- **LaLiga auth** (`backend/auth`): pairing, encrypted vault and refresh.
- **API** (`backend/api`): leagues, teams, players, calendar, market,
  buyout — OpenAPI at http://localhost:8001/docs when running locally. Player
  detail stats aggregate catalog, calendar, and private scraping data.
- **Read-only CLIs** for market and buyout analysis; no automated bidding or
  clause payment in CLI or browser-session flows.

## Screenshots

These ten captures were taken from the signed-in application in a browser on
27 October 2026 (Europe/Madrid), with real league and player data. Values and
availability can change. See the [capture notes](docs/frontend.md#product-captures).

### Light theme

![Live lineup in light theme](docs/images/screenshots/lineup-live-light.jpg)

![Live market in light theme](docs/images/screenshots/market-live-light.jpg)

![Live players catalog in light theme](docs/images/screenshots/players-live-light.jpg)

![Ionut Radu player details in light theme](docs/images/screenshots/details-ionut-radu-live-light.jpg)

![Live lineup builder in light theme](docs/images/screenshots/lineup-builder-live-light.jpg)

### Dark theme

![Live lineup in dark theme](docs/images/screenshots/lineup-live-dark.jpg)

![Live market in dark theme](docs/images/screenshots/market-live-dark.jpg)

![Live players catalog in dark theme](docs/images/screenshots/players-live-dark.jpg)

![Lamine Yamal player details in dark theme](docs/images/screenshots/details-lamine-yamal-live-dark.jpg)

![Live lineup builder in dark theme](docs/images/screenshots/lineup-builder-live-dark.jpg)

## Quick start

Create the ignored root `.env` from `.env.template` and set its
`SMTP_PASSWORD` to a Resend sending API key. Then `poe up` creates any missing
service env files and starts identity, Postgres, Redis, LaLiga auth, API,
scraping and the frontend:

```bash
test -f .env || cp .env.template .env
uv run poe install
uv run poe up
```

- App: http://localhost:3000 — register a new account; no shared demo password.
- Verification and recovery emails arrive in each user's own inbox through Resend.
- API docs: http://localhost:8001/docs.
- Scraping health: http://localhost:8002/health/live.

Configure Google/Facebook/Apple credentials in `backend/identity/.env`.
Apple needs an HTTPS domain. Production configuration, provider setup and release
checks: [identity](backend/identity/README.md) and
[release checks](docs/authentication/release-checks.md). Persistent LaLiga storage
requires `USE_MEMORY_STORE=false` and a stable vault key; identity always uses Postgres.

**Services on the host (Vite HMR):**

```bash
docker compose up -d postgres redis
uv run poe dev-clean
```

`dev-clean` stops Compose app containers and stale project Uvicorn servers,
then starts auth (`:8000`), API (`:8001`), scraping (`:8002`), identity (`:8003`), and Vite
(`:3000`) with reload enabled. It reports occupied ports owned by other
processes instead of stopping them. The command creates missing service
`.env` files. Set `SCRAPER_CONTACT` in `backend/scraping/.env` to a contact
address before using the scraper against FutbolFantasy. Scraping API calls use
the shared token in `backend/scraping/.env`; the command passes it to the API
automatically.

From `frontend/` only: `bun install && bun run dev:all` (or `npm`).

Per-service notes: [auth](backend/auth/README.md), [API](backend/api/README.md),
[scraping](backend/scraping/README.md) (`fantasy-scraper`, `fantasy-parse`).

## Repository

| Path | Role |
|------|------|
| [`frontend/`](frontend/) | React lineup, market, players, and player-detail UI |
| [`backend/identity/`](backend/identity/) | Better Auth identity and application JWTs |
| [`backend/auth/`](backend/auth/) | LaLiga pairing and encrypted vault |
| [`backend/api/`](backend/api/) | Fantasy proxy routes and CLIs |
| [`backend/scraping/`](backend/scraping/) | FutbolFantasy scraper + parser (port 8002, private) |
| [`docs/`](docs/) | Architecture, authentication, API domain guides |
| [`docker/`](docker/) | Identity database initialization, HTTPS ingress, OTEL collector |
| [`assets/`](assets/) | Sample Fantasy JSON trees |

## Tests

```bash
uv run poe test
```

Frontend only: `cd frontend && bun run test`. Hooks lint (also a pre-commit and CI step):
`cd frontend && bun run lint`.

## Read-only lineup builder

See the [lineup builder guide](docs/api/lineup-builder.md) for the authenticated planning POST, CLI,
browser-session flow, source restrictions and optional explanation configuration.
