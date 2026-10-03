# Frontend

React web app in `frontend/` (Vite, Bun). It is the browser entry point for
LaLiga Fantasy Builder: sign-in, league selection, lineup editing, and a
read-only market board. It never calls LaLiga directly and does not persist
the internal JWT beyond memory.

System context: [Architecture](architecture.md). API routes the UI calls:
[API overview](api/README.md).

## Screenshots

Full pages (league selector and shell header included):

![Lineup screen — formation controls, standings, pitch, and squad](images/lineup.png)

![Market screen — listings table with actions](images/market.png)

Three-column lineup layout (standings, pitch, paginated squad):

![Lineup — players list, pitch, and squad grid](images/lineup-pitch-squad.jpg)

Assets live under [`docs/images/`](images/) for use in other docs.

## Running locally

Same-origin proxying matches production Nginx:

- `uv run poe dev` from the repo root (auth, API, and Vite), or
- `cd frontend && bun run dev:all` when backends are already up.

The app is served at http://localhost:3000. `/auth`, `/laliga`, and `/api` are
proxied to auth and the API.

## Routes

| Path | Screen | Primary API domains |
|------|--------|---------------------|
| `/` | Lineup — formation, pitch, squad, standings | [Leagues](api/leagues/README.md), [Teams](api/teams/README.md), [Calendar](api/calendar/README.md) |
| `/market` | Market — league listings table (read-only) | [Market](api/market/README.md), [Players](api/players/README.md), [Calendar](api/calendar/README.md) |

Navigation lives in the shell header. The selected league from the dropdown
applies to both screens.

## Authentication

After Keycloak login, the app exchanges the auth session for an internal JWT
(`POST /auth/token` with CSRF) and sends `Authorization: Bearer …` on every
`/api` request. `needs_reauth` surfaces as a gate asking the user to link
LaLiga again. Details: [Authentication](authentication/authentication.md).

## Lineup screen

Feature code under `frontend/src/features/lineup/`.

The toolbar row covers matchweek navigation, live score for the week, formation
picker, lineup preferences input, save, and total squad value. Below that,
standings rank league managers; the pitch shows the saved formation; the squad
panel lists roster players with pagination (`18/24` in the screenshot above).

- Loads the user’s leagues and remembers the selected league.
- Shows matchweek standings, the active lineup on a pitch, and the squad bench.
- Supports formation selection and `PUT /teams/{team_id}/lineup` to save (full
  replace upstream semantics — see [Teams API](api/teams/README.md)).

Shared player tiles and score badges are reused on the market table.

## Market screen

Feature code under `frontend/src/features/market/`. The table matches the
[Market screenshot](#screenshots): player tile, position badge (coach uses id
5 / `COA`), FSYP, last performance badges (past matchweeks only), price with
variation, availability icons, average, seal countdown, and seller (`LALIGA` for
official listings). A toolbar shows **your money** (`GET /teams/{team_id}/money`
with league fallback). Each row exposes an **Actions** menu when applicable:
**Hire** (LaLiga listings), **Purchase bid** (opponent listings), **Modify bid**
(when you already bid), and **Pay release clause** (unlocked buyout on an
opponent squad entry). Mutations require confirmation in a dialog; automated
CLIs remain read-only.

Seller names link to `/?team={teamId}` on the lineup screen when a seller team
id is present (standing must include that team).

`useMarketBoard` loads and joins:

1. `GET /api/market/leagues/{league_id}` — current listings for the selected
   league (`MarketSnapshot`; see [Market API](api/market/README.md)).
2. `GET /api/players` — master catalog for names, photos, and positions.
3. `GET /api/calendar/current` — infer the last played matchweek and recent
   weeks for last performances (excludes the open matchweek).
4. `GET /api/players/{player_id}/market-value` — per listed master id, for
   value trend and variation columns.
5. `GET /api/calendar/weeks/{week}/stats` — points for the last few weeks to
   build last-performance badges.
6. `GET /api/teams/{team_id}/money` — caller balance for the toolbar and bid
   validation.

Row shaping lives under `features/market/model/` (barrel `marketRows.ts`; tests
in `marketRows.test.ts` and `actions/marketActions.test.ts`). Listing records
may appear under several Fantasy keys; the API normalizes the snapshot object
before OpenAPI validation; the client still tolerates wrapper keys when joining
catalog data.

### Table columns (user-facing)

| Column | Source (conceptual) |
|--------|---------------------|
| Player | Master id + catalog media; Actions menu when bids or clause pay apply |
| Position | `positionId` (coach uses id 5) |
| FSYP | Season or listing points field when present |
| Form | Last three **played** matchweek scores with `F{n}` labels (open week excluded) |
| Market value | Listing price; variation from market-value history |
| Availability | Maps Fantasy `playerStatus` to asset icons (available / questionable / unavailable) |
| Average score | Listing average when present |
| Seal ends| Listing expiration countdown |
| Seller | Manager (link to lineup when team id known) or `LALIGA` |

## Layout conventions

- API paths and encoding: `frontend/src/api/client.ts` (`paths`, segment encode).
- DTO → UI mappers: `frontend/src/api/mappers.ts`.
- Server state: TanStack Query (`useQuery` / `useQueries`).
- Auth and league context: `AuthProvider`, `LeagueProvider`.
