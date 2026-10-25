# LaLiga Fantasy Builder

Companion for a LaLiga Fantasy league: edit your lineup, browse player profiles,
and manage market bids from the browser, backed by an API that proxies Fantasy
data and user-confirmed writes with your linked account.

| Topic | Doc |
|-------|-----|
| Architecture and trust boundaries | [docs/architecture.md](docs/architecture.md) |
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

Screenshots refreshed on 23 October 2026 (Europe/Madrid) from the current UI,
using deterministic browser fixtures with fictional players and account data.
Balances, offers, performance, standings, and weather illustrate the interface;
they are not live account or provider values. Desktop captures use 1440 CSS pixels;
mobile captures use 390 CSS pixels. See the [capture workflow](docs/frontend.md#refreshing-screenshots).

### Lineup

Centered lineup controls and the current starting XI:

![Current lineup with centered controls and starting XI, light theme](docs/images/screenshots/lineup-current-light.jpg)

![Current lineup with centered controls and starting XI, dark theme](docs/images/screenshots/lineup-current-dark.jpg)

Full-page desktop view with the sample 4-3-3 starting XI, paginated squad,
manager ranking, and LALIGA standings:

![Full lineup page with the 4-3-3 pitch, squad, manager ranking, and LALIGA standings](docs/images/screenshots/lineup-current-squad.jpg)

Expanded kickoff forecast with rain, wind, and retrieval time:

![Expanded sample kickoff forecast](docs/images/screenshots/lineup-current-forecast.jpg)

![Lineup builder player scope, trade permissions, and mandatory players](docs/images/screenshots/lineup-builder-top.png)

![Lineup builder mandatory players and formation preferences](docs/images/screenshots/lineup-builder-options.png)

Builder results remain previews. Filter recommendations, inspect a starting XI
and its squad projection, then choose **Use as draft** to prepare local changes.

![Lineup builder recommendation notes and current-squad versus external-player filters](docs/images/screenshots/lineup-builder-results.png)

![Recommended 4-3-3 starting XI with individual player scores](docs/images/screenshots/lineup-builder-pitch.png)

![Projected cash, retained squad, deadlines, and transaction plan](docs/images/screenshots/lineup-builder-projection.png)

![Lineup player actions](docs/images/screenshots/lineup-player-actions.png)

### Market and player catalog

![Market board in dark mode with Offers, My bids, and available balance](docs/images/screenshots/market-board.png)

![Hire player dialog with bid limits and amount controls](docs/images/screenshots/market-hire-dialog.png)

![Market offers panel with amounts, expiry countdowns, and accept or reject actions](docs/images/screenshots/market-offers.png)

![Players catalog in dark mode with form, release clauses, owners, and bookmarks](docs/images/screenshots/players-catalog.png)

### Player profile

![Demo player profile with availability, per-match averages, and Fantasy indicators](docs/images/screenshots/player-profile-overview.png)

![Last-five performance chart with club badges, summary metrics, and fixture details](docs/images/screenshots/player-fixture-stats.png)

![Latest player news and injury history with independent pagination](docs/images/screenshots/player-fantasy-data.png)

![Previous and upcoming matches](docs/images/screenshots/player-matches.png)

![Player market-value chart](docs/images/screenshots/player-market-value.png)

![Per-match averages details](docs/images/screenshots/player-averages-details.png)

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
[cutover](docs/authentication/better-auth-cutover.md). Persistent LaLiga storage
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
