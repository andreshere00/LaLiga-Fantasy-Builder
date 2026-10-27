# Real LALIGA club standings

`GET /competitions/{competition_id}/standings?mode=completed` returns all 20
current-season clubs. The frontend uses the same route under `/api`.
Fantasy manager rankings remain at `/leagues/{league_id}/standing`.

## Authentication and source

An auth-issued internal JWT is required, including on cache hits. LaLiga pairing
is unnecessary. The default `laliga-fixtures` source needs no paid football key.
The API reads all 38 public Fantasy calendar weeks with at most four concurrent
requests and reads the public teams-master directory without a LaLiga bearer.

Only verified finished fixtures (`matchState=7`) contribute. The API computes
played, won, drawn, lost, goals for/against/difference and last-five results from
scores. It sorts form by actual kickoff, so postponed fixtures enter correctly
when eventually played. Identical repeated fixtures count once; conflicting
copies, missing final dates/scores and foreign clubs fail explicitly.

The private scraper reads the official overall LaLiga classification and its
published season. The API verifies every computed club total against it and
preserves official ranking and adjusted points. This avoids approximating LaLiga
tie-break rules or discarding deductions. Different club labels are resolved by
verified names/aliases, rather than assuming both systems share club ids.

The scraper uses the allowed canonical Spanish route
`https://www.laliga.com/laliga-easports/clasificacion`. The requested localized
English route is disallowed by robots.txt. The separate allowlisted client checks
robots and redirects, honors the published crawl delay, and allows at most one
request every 30 seconds. It parses server-rendered JSON without running scripts.

## Configuration

API settings (`backend/api/.env`):

```dotenv
STANDINGS_SOURCE=laliga-fixtures
STANDINGS_TTL_SECONDS=3600
SCRAPING_BASE_URL=http://127.0.0.1:8002
SCRAPING_SERVICE_TOKEN=<same private token as scraping service>
```

Compose uses `http://scraping:8002` instead. Start the scraping service on port
8002 and configure its `SCRAPER_CONTACT` or `SCRAPER_USER_AGENT`. Restart the API
if settings change. Public fixture reads need outbound HTTPS on the API service.

Only the configured application competition (`LALIGA_COMPETITION_ID=1`) and the
current season published by the official page are supported by this source.
`season=2026` means 2026/27. Omit season to resolve it from the official metadata.
Unsupported seasons/competitions return 404. Invalid parameters return 422.

`mode=live` (the API default when omitted) returns 503
`standings_live_unavailable`. Both CLIs and the frontend explicitly request
`completed`. In-progress, scheduled and postponed games are excluded.

## Data contract

| Field | Meaning |
|-------|---------|
| `position` | Official rank, 1–20 |
| `team` | Fantasy real club `{id, name, badgeUrl}`; nullable badge |
| `points` | Official points, including adjustments |
| `played` | Finalized games |
| `won`, `drawn`, `lost` | Computed result totals |
| `goalsFor`, `goalsAgainst`, `goalDifference` | Computed goal totals |
| `last5Matches` | Up to five finalized results, oldest first |

Recent results include `matchId`, `kickoffAt`, `opponent`, `venue`, `goalsFor`,
`goalsAgainst`, and `result` (`W`, `D`, `L`). Match ids use `laliga-fantasy:<id>`.
Teams and opponents use Fantasy real-club ids, never manager team ids.
Preseason clubs have zero totals and empty form. Clubs with fewer than five
completed games have exactly that many recent results.

Envelope fields include `competition`, `season`, `mode`, `rows`,
`source="laliga-fixtures"`, `fetchedAt`, `sourceUpdatedAt`, `generatedAt`, `cached`,
`isProvisional=false` and `liveAvailable=false`. `fetchedAt` is the official page
retrieval time and survives cache hits. `sourceUpdatedAt` is null because the
page provides no verified publication timestamp. Times have UTC offsets.

## Cache and failures

Successful API snapshots and official-page snapshots have one-hour in-memory
caches with single-flight refresh. Club identities are cached for 24 hours.
Each worker owns its own cache. Frontend data has one-hour freshness, is scoped
to the signed-in user and is cleared on logout/session expiration.

Missing/invalid JWT returns 401 before any source calls. Source outages and
malformed data produce sanitized upstream errors; credentials and raw upstream
responses are never returned. If the official table and fixtures update at
different times, mismatched totals return 502 `standings_error`. Retry later;
incomplete tables are never displayed as complete. Expired snapshots are not
served as fresh after a failed refresh. No automatic provider switching occurs.

The current implementation was verified against the official 2026/27 table:
all 20 club totals matched 78 finished fixtures across 380 scheduled fixtures.
This observation establishes the tested snapshot, not a real-time guarantee.

## Optional API-Football adapter

`STANDINGS_SOURCE=api-football` selects the original adapter. Set
`API_FOOTBALL_KEY`, `STANDINGS_PROVIDER_LEAGUE_ID=140`,
`STANDINGS_TIMEOUT_SECONDS=10` and optional verified `STANDINGS_CLUB_IDS={}`.
That key must cover the requested season. Plan denial returns 503
`standings_plan_unavailable`; provider outages return `standings_unavailable`.
The adapter preserves provider rank/points and reconciles provider fixture totals.
Its match ids use `api-football:<id>`. It does not enable live mode.

## Read-only access

```bash
cd backend/api
uv run fantasy-standings --jwt "$INTERNAL_JWT" --json
```

Automated app login without LaLiga pairing:

```bash
cd backend/auth
uv run fantasy-browser-session standings-analysis --json
```

Both CLIs accept an optional current-season selector and are read-only. See the
[frontend guide](../../frontend.md) for the widget.
