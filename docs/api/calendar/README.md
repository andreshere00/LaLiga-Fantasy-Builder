# Calendar API

Matchday calendar and stats proxied by `backend/api`. Controllers validate an
internal JWT, then call public Fantasy paths **without** a LaLiga bearer (no
`/internal/laliga/bearer`, no pairing requirement for these reads).

Upstream paths:

```text
{LALIGA_FANTASY_ORIGIN}/api/v1/competition/{LALIGA_COMPETITION_ID}/week/current
{LALIGA_FANTASY_ORIGIN}/api/v1/competition/{LALIGA_COMPETITION_ID}/calendar?weekNumber={week}
{LALIGA_FANTASY_ORIGIN}/stats/v1/competition/{LALIGA_COMPETITION_ID}/stats/week/{week}
```

## Guides

- [Adding endpoints](../adding-endpoints.md) — shared CRS checklist for new
  routes
- [Adding calendar endpoints](adding-calendar-endpoints.md) — calendar-specific
  upstream paths and public-read notes
- [OpenAPI / Swagger](../openapi.md) — schema and Swagger sync
- [Developing authenticated endpoints](../../authentication/developing-authenticated-endpoints.md)
  — internal JWT gate (calendar skips the LaLiga bearer hop)

## Routes

| Method | Path | Upstream | Response model |
|--------|------|----------|----------------|
| `GET` | `/calendar/current` | `{CMP}/week/current` | `CurrentWeek` |
| `GET` | `/calendar/weeks/{week}` | `{CMP}/calendar?weekNumber={week}` | `list[Fixture]` |
| `GET` | `/calendar/weeks/{week}/stats` | `{ORIGIN}/stats/v1/.../stats/week/{week}` | `list[MatchStats]` |

All require `Authorization: Bearer <internal JWT>`. Models live in
`fantasy_api.schemas.calendar` (`extra="allow"` for unknown upstream fields).

## Identifiers

| Id | Notes |
|----|--------|
| `week` | Matchweek number (`>= 1`). Upstream rejects `weekNumber=0` with `500`. |
| Fixture `id` | String in calendar fixtures. |
| Stats match `id` | Integer in stats payloads; not the same as fixture `id`. |
| `localId` / `visitorId` | Real club ids in fixtures, not fantasy manager `teamId`. |
| Stats player `id` | Master `playerId`; not `playerTeamId`. |

## Local try-out

### Prerequisites

1. **Auth** on port **8000** (for example `./scripts/authenticate-laliga.sh` or
   `uv run uvicorn fantasy_auth.main:app --port 8000` in `backend/auth`).
2. **API** on port **8001** (`uv run uvicorn fantasy_api.main:app --reload --port 8001`
   in `backend/api`).
3. An **internal JWT** (`INTERNAL_JWT`) from `POST /auth/token` after app login
   (see [API README](../../../backend/api/README.md)). Calendar routes do **not**
   require LaLiga pairing for the upstream call, but the API still validates the
   JWT.

Check the API is up:

```bash
curl -sS http://localhost:8001/health
```

### End-to-end curl flow

Use the current matchweek from `/calendar/current`, then fixtures and stats for
that week:

```bash
curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  http://localhost:8001/calendar/current | jq

WEEK=$(curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  http://localhost:8001/calendar/current | jq -r '.weekNumber')

curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  "http://localhost:8001/calendar/weeks/${WEEK}" | jq

curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  "http://localhost:8001/calendar/weeks/${WEEK}/stats" | jq '.[0] | keys'
```

### Sample responses (verified locally)

`GET /calendar/current` (matchweek 8):

```json
{
  "isLive": false,
  "nextWeek": 9,
  "previousWeek": 7,
  "weekNumber": 8,
  "openingWeekDate": "2026-10-09T21:00:00+02:00",
  "closingWeekDate": "2026-10-13T03:00:00+02:00"
}
```

`GET /calendar/weeks/8` returns ten fixtures. One item (scheduled match,
`matchState` `1`; null scores are omitted from the JSON because of
`response_model_exclude_none`):

```json
{
  "id": "71",
  "matchDate": "2026-10-11T16:15:00+02:00",
  "date": "2026-10-11T16:15:00+02:00",
  "time": "2026-10-11T16:15:00+02:00",
  "localId": 16,
  "visitorId": 26,
  "matchState": 1,
  "featured": false
}
```

`GET /calendar/weeks/8/stats` returns one object per match. Top-level keys on
the first match:

```json
["date", "id", "local", "matchState", "visitor"]
```

Each `local` / `visitor` side includes club metadata and a `players` array with
`weekPoints` (master `playerId` in `id`). Use `jq` for full payloads; stats
responses are large (~100KB+).

### CLI

```bash
cd backend/api
uv run fantasy-calendar --jwt "$INTERNAL_JWT" --api-base http://localhost:8001
uv run fantasy-calendar --jwt "$INTERNAL_JWT" --week 8 --json
```

With session cookies instead of a JWT:

```bash
export FANTASY_SESSION='…'
export FANTASY_CSRF='…'
uv run fantasy-calendar --auth-base http://localhost:8000 --api-base http://localhost:8001
```

Interactive docs: http://localhost:8001/docs (tag **calendar**, Authorize with
`Bearer <internal JWT>`).

## Architecture

```text
api/calendar.py
  → services/calendar.py
    → repositories/calendar.py
      → clients/laliga_fantasy.py  # get_public_json (no Authorization)
```

Shared path helpers: `repositories/paths.py` (`competition_path`, `stats_week_path`).
