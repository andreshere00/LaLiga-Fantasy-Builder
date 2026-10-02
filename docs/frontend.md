# Frontend

React web app in `frontend/` (Vite, Bun). It is the browser entry point for
LaLiga Fantasy Builder: sign-in, league selection, lineup editing, and a
read-only market board. It never calls LaLiga directly and does not persist
the internal JWT beyond memory.

System context: [Architecture](architecture.md). API routes the UI calls:
[API overview](api/README.md).

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

- Loads the user’s leagues and remembers the selected league.
- Shows matchweek standings, the active lineup on a pitch, and the squad bench.
- Supports formation selection and `PUT /teams/{team_id}/lineup` to save (full
  replace upstream semantics — see [Teams API](api/teams/README.md)).

Shared player tiles and score badges are reused on the market table.

## Market screen

Feature code under `frontend/src/features/market/`. The board is **read-only**:
no bids, listings, or offers from the UI (aligned with read-only CLIs).

`useMarketBoard` loads and joins:

1. `GET /api/market/leagues/{league_id}` — current listings for the selected
   league (`MarketSnapshot`; see [Market API](api/market/README.md)).
2. `GET /api/players` — master catalog for names, photos, and positions.
3. `GET /api/calendar/current` — infer recent matchweeks for form.
4. `GET /api/players/{player_id}/market-value` — per listed master id, for
   value trend and variation columns.
5. `GET /api/calendar/weeks/{week}/stats` — points for the last few weeks to
   build form badges.

Row shaping and defensive parsing live in `marketRows.ts` (unit tests in
`marketRows.test.ts`). Listing records may appear under several Fantasy keys;
the API normalizes the snapshot object before OpenAPI validation; the client
still tolerates wrapper keys when joining catalog data.

### Table columns (user-facing)

| Column | Source (conceptual) |
|--------|---------------------|
| Player | Master id + catalog media |
| Position | `positionId` (coach uses id 5) |
| FSYP | Season or listing points field when present |
| Form | Last three matchweek scores from calendar stats |
| Market value | Listing price; variation from market-value history |
| Availability | Maps Fantasy `playerStatus` to available / questionable / unavailable |
| Average | Listing average when present |
| Seal ends on | Listing expiration countdown |
| Seller | Manager or `LALIGA` for official listings |

## Layout conventions

- API paths and encoding: `frontend/src/api/client.ts` (`paths`, segment encode).
- DTO → UI mappers: `frontend/src/api/mappers.ts`.
- Server state: TanStack Query (`useQuery` / `useQueries`).
- Auth and league context: `AuthProvider`, `LeagueProvider`.
