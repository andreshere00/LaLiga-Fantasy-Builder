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

- [Official Ideal XI investigation](ideal-xi-research.md) — verified public
  membership flags, latest completed round, and proposed integration
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
| `GET` | `/calendar/weeks/{week}/weather` | Public calendar + OpenWeather forecast | `WeekWeather` |

All require `Authorization: Bearer <internal JWT>`. Models live in
`fantasy_api.schemas.calendar` (`extra="allow"` for unknown upstream fields).
The API validates known fields with Pydantic and maps malformed upstream payloads
to sanitized 502 errors; the frontend parses calendar responses with Zod.

## Optional stadium weather

`GET /calendar/weeks/{week}/weather` is an application aggregate for weeks 1–38,
not a new Fantasy upstream path. It uses the existing internal JWT gate without
requesting a LaLiga bearer. Each `matches` row carries the calendar `fixtureId`,
`localId`, `visitorId`, normalized `kickoff`, `weather`, and nullable `fetchedAt`.
Join on fixture identity and kickoff, never on the different stats-match ID.
The envelope identifies `weekNumber` and request `generatedAt`; `fetchedAt` is
the original successful provider retrieval time, even when a cached forecast
is returned. `weather.snapshot.forecast_for` identifies the selected forecast
slot, not the retrieval time. Existing weather snapshot/venue members use the
same snake_case format as player stats; the frontend normalizes these aliases.

Configure the existing server-side `OPENWEATHER_API_KEY` to enable forecasts.
The browser never receives this key or contacts the provider. Forecasts cover
up to five days in three-hour intervals, with the nearest slot within 90 minutes
of the offset-aware kickoff and within the provider's actual returned coverage.
No current-weather or historical-weather fallback is used. Coordinate forecasts
share the configurable 1,800-second cache and a maximum of three concurrent
provider reads across player detail and calendar requests.

Missing/disabled weather returns **200** with a null snapshot and one of
`disabled`, `venue_unknown`, `kickoff_unknown`, `beyond_forecast_horizon`,
`provider_unavailable`, `match_started`, or `status_unknown`. A provider failure
affects that venue's forecasts, preserving other successful rows. Finished or
past kickoffs do not fetch new forecasts. An undocumented venue override or
neutral ground fails closed as `venue_unknown`. Calendar failures and malformed
or conflicting fixture payloads remain sanitized errors, not successful empty
schedules. No provider key, authenticated URL, or raw error body is returned.

### Verified calendar and stadium semantics

A read-only public probe on 20 October 2026 reported `weekNumber=10`,
`previousWeek=9`, and `nextWeek=11`. Week 9 contained ten `matchState=7` fixtures;
weeks 10 and 11 contained ten scheduled `matchState=1` fixtures. An unstarted
`weekNumber` is already the next round to display; do not skip it automatically
to `nextWeek`. All ten distinct finished matches establish completion even if
the metadata pointer is late. `isLive=false` alone does not establish completion.
No further numeric live/postponed-state mapping has been independently verified:
the panel labels such statuses **Status unconfirmed**, preserves reported scores
after kickoff, and never treats them as finished. A currently started reported
round takes priority over an older deferred match; the UI does not scan history.

Stadium Fantasy IDs were reconciled against the public
[teams-master directory](https://fantasy-api.llt-services.com/api/v3/teams-master)
on 20 October 2026, correcting outdated mappings for Osasuna, Rayo, Sociedad,
Sevilla, Valencia, and others. All twenty currently participating clubs now
resolve. The stored directory remains a versioned source: recheck it after
promotion/relegation or a venue change rather than guessing a city.
Betis currently plays at [La Cartuja](https://www.realbetisbalompie.es/partido/betis/barcelona/21979/2026/),
and the directory also includes Elche, Málaga's
[La Rosaleda](https://www.malagacf.com/estadio-la-rosaleda), and Deportivo's
[ABANCA-RIAZOR](https://www.rcdeportivo.es/es/estadio-abanca-riazor).
Coordinates for the updated grounds were checked against OpenStreetMap:
[La Cartuja](https://www.openstreetmap.org/relation/6138566),
[Martínez Valero](https://www.openstreetmap.org/way/79833556),
[La Rosaleda](https://www.openstreetmap.org/way/146539049), and
[Riazor](https://www.openstreetmap.org/way/34237293).

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
uv run fantasy-calendar --jwt "$INTERNAL_JWT" --week 10 --weather --json
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

api/calendar.py (weather)
  → services/calendar_weather.py
    → repositories/calendar.py → clients/laliga_fantasy.py (public fixtures)
    → services/weather.py → repositories/weather.py → clients/openweather.py
```

Shared path helpers: `repositories/paths.py` (`competition_path`, `stats_week_path`).
