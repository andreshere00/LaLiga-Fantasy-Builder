# API service

Fantasy routes for the browser app and the CLIs. Callers send an internal JWT
from auth. LaLiga bearers are fetched in private and never returned.
The request path is in [Architecture](../../docs/architecture.md).

## Local run

```bash
cd backend/api
cp .env.example .env
uv sync --all-extras
uv run uvicorn fantasy_api.main:app --reload --port 8001
```

From the repo root, with auth on the Compose network:
`docker compose --profile apps up --build` ([root README](../../README.md)).

Standalone image:

```bash
docker build -t laliga-fantasy-builder-api -f backend/api/Dockerfile backend/api
docker run --rm -p 8001:8001 --env-file backend/api/.env laliga-fantasy-builder-api
```

Set `AUTH_JWKS_URL` and `AUTH_INTERNAL_BASE_URL` when not using Compose.
`LALIGA_FANTASY_ORIGIN` defaults to `https://fantasy-api.llt-services.com`.
`LALIGA_COMPETITION_ID` defaults to `1`.

## Routes

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/me` | App identity from the internal JWT |
| `GET` | `/laliga/credential-probe` | Bearer available, token redacted |
| `GET` | `/laliga/leagues-probe` | Fantasy leagues connectivity, redacted |
| `GET` | `/leagues...` | [leagues](../../docs/api/leagues/README.md) |
| `POST` | `/lineup-builder/leagues/{league_id}/build` and `/build/stream` | Read-only recommendations; JWT membership verified; JSON result or progress as JSON lines |
| `GET`/`PUT` | `/teams...` | [teams](../../docs/api/teams/README.md) |
| `GET` | `/players...` | [players](../../docs/api/players/README.md). Catalog and market value are public; league and stats routes use JWT |
| `GET` | `/calendar/...` | Matchday, fixtures, stats, optional stadium forecasts. JWT required; Fantasy read is public |
| `GET` | `/competitions/{id}/standings` | [Real LALIGA clubs](../../docs/api/standings/README.md); JWT, public fixtures + official scraper, `mode=completed` |
| `GET`/`POST`/… | `/market/...` | [market](../../docs/api/market/README.md) |
| `GET`/`POST`/`PUT` | `/buyout/...` | [buyout](../../docs/api/buyout/README.md) |

New routes: [Adding endpoints](../../docs/api/adding-endpoints.md).
Swagger: http://localhost:8001/docs. Regenerate with
`uv run poe generate-openapi` ([details](../../docs/api/openapi.md)).

Player detail stats combine Fantasy catalog and matchweek data with profile,
fixture, and match information from the private scraping service. The aggregate
`GET /players/{player_id}/stats/detail` returns successful segments alongside
sanitized `segment_errors` when an optional source fails. See the
[Players API guide](../../docs/api/players/README.md) for query filters,
fallback values, and segment behavior.

## CLI

API on port 8001; application login uses the shared frontend origin at port 3000.
Pass `--jwt` / `INTERNAL_JWT` obtained from `fantasy-browser-session --exports`.

```bash
cd backend/api
uv run fantasy-leagues --league-id 123 --week 5 --json
uv run fantasy-teams --team-id 99 --week 5
uv run fantasy-players --player-id 7 --league-id 42
uv run fantasy-calendar --week 8 --json
uv run fantasy-calendar --week 10 --weather --json
uv run fantasy-standings --season 2026 --json
uv run fantasy-market --league-id 123 --json
uv run fantasy-buyout --league-id 123 --player-team-id pt-9 --json
```

Signed-in analysis from auth: `uv run fantasy-browser-session leagues-analysis`.
`fantasy-market` and `fantasy-buyout` are read-only.

`fantasy-calendar --weather` adds optional stadium kickoff forecasts using the
existing `OPENWEATHER_API_KEY`. Calendar/weather reads need app login only,
without LaLiga pairing or a bearer exchange. Missing credentials for the weather
provider return explicit disabled forecasts while retaining fixtures and scores.
See the [Calendar guide](../../docs/api/calendar/README.md#optional-stadium-weather)
for coverage, caching, and partial failures. Weather credentials stay server-side.

Real-club standings default to `STANDINGS_SOURCE=laliga-fixtures`: public Fantasy
calendar scores provide completed totals and last-five form; the private official
LaLiga scraper verifies completeness and supplies ranking and adjusted points.
Configure `SCRAPING_BASE_URL` and `SCRAPING_SERVICE_TOKEN`. For native development,
use `http://127.0.0.1:8002`; Compose uses `http://scraping:8002`.
Snapshots are cached for an hour. Live mode is unavailable (503). Both standings
CLIs require only app login and remain read-only. The optional `api-football`
source still requires a key with current-season access. See the feature guide.

## Tests

```bash
cd backend/api && uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80
```

## Read-only lineup builder

See the [lineup builder guide](../../docs/api/lineup-builder.md) for the authenticated planning POST, CLI,
browser-session flow, source restrictions and optional explanation configuration.

### Player radar datasets

`RADAR_STORE_PATH` optionally points to a bounded, operator-managed JSON snapshot
store. `GET /players/{id}/stats/radar` and
`fantasy-player-stats --segment radar --season 2026-27` require only an application JWT, without LaLiga pairing.
Unconfigured players return an honest unavailable state. For the file format,
reviewed DataMB mappings and comparison rules, see
[Players API](../../docs/api/players/README.md#role-specific-performance-radar).

### Radar coverage inventory (phase 1)

`fantasy-radar-sync inventory --season 2026-27 --work-dir /data/radar/staging`
reads the public catalog through `PlayersRepository`, without login or a LaLiga
bearer. `--catalog full-catalog.json` runs offline. Set `--minimum-count` to the
expected catalog lower bound for the first run. Subsequent runs reject removals
of over 10% unless reviewed with `--allow-large-removal`. All numeric master IDs
are retained; coaches are excluded explicitly, unknown positions need review.
The command writes an inventory, coverage entries and a JSON change/count report.
Departures remain archived; invalid input never replaces the previous inventory.
See the [coverage plan](../../docs/scraping/player-radar-coverage-plan.md).

### Reviewed radar identities (phase 2)

`fantasy-radar-sync candidates --work-dir /data/radar/staging --aliases names.json`
exports name evidence by exact Fantasy ID, without approving any external link.
`names.json` is an offline export (the existing `player_names.json` may be used);
FutbolFantasy aliases never prove a DataMB identity. The generated review queue
keeps homonyms separate and leaves provider keys empty.

`fantasy-radar-sync registry --registry registry.json` validates append-only
identity decisions. Each master ID/season has increasing versions and one latest
state (`pending_review`, `matched`, `ambiguous`, `not_found`). Matches require a
reviewer, date, observed source key, expected name, validity start and evidence.
A changed club does not rewrite identity history. Never infer provider URLs.

### Supply and role gates (phase 3)

`fantasy-radar-sync capture --profile-key Pedri_Midfielder_stats --season 2026-27
--output /path/to/captures/new-review.json` captures an observed profile through
the enabled private adapter and prints the semantic hash for review. Existing
paths are rejected. This operation does not approve supply or publish a radar.
See the [local live pilot results](../../docs/scraping/radar-live-pilot-results.md)
for the first six-role publication and remaining production gates.

`fantasy-radar-sync audit --audits audits.json --captures captures/` verifies
reviewed permission/discovery/definition decisions and immutable seven-column
captures. Roles are approved per identity/season with exactly one stable default.
Six synthetic role tests establish contract behavior, not real supply approval.
See [supply audit and remaining gates](../../docs/scraping/radar-supply-audit.md).
DataMB remains disabled pending verified production evidence.

### Resumable radar publication (phase 4)

The operational CLI separates `plan`, `fetch`, `validate`, `publish`, `report`
and `rollback`. For plan/fetch/validate, supply `--work-dir`, `--registry`,
`--audits` and `--captures`. Each operation revalidates approvals and captured
column contracts; only `fetch` contacts the private scraping adapter. For an
authorized offline feed, use `fetch --imports snapshots.json`. Imported records
must match approved identity, role, recipe, source columns and cohort.

Checkpoints are keyed by reviewed inputs and preserve valid observations after
failures. Fresh records are skipped (default seven days); schema/identity failures
are quarantined until the review changes. Blocking/unavailable responses stop
the batch. Source timestamps are retained, including stale adapter cache hits.
The semantic observation ID excludes retrieval timestamps and operational flags.

`validate` writes `validated.json`; it includes every catalog footballer in its
coverage denominator and distinguishes unknown eligibility from low minutes.
`publish --validated /data/staging/validated.json --root /data/published` validates
bounded files and checksums before atomically replacing `current.json`. Releases
contain catalog, radar store, coverage, comparison index, report and manifest.
Cross-process locks exclude simultaneous writers; API storage is read-only.
`report --root ...` reads the active report; `rollback --root ... --release-id ...`
validates an existing release before promotion. Keep old releases for recovery.

### Local published reads (phase 5)

Set `RADAR_DATASET_ROOT=/data/radar/published` (API mount read-only). Leave
`RADAR_STORE_PATH` unset; competing modes fail startup validation. The API pins
and validates one complete release for each radar request, including comparison
and coverage. `RADAR_STALE_DAYS=8`, `RADAR_MAXIMUM_DAYS=30` control active-season
freshness and are checked on reads, so a failed scheduler cannot serve indefinitely.

### Scheduling and operations (phase 7)

Local and VM Compose provide an opt-in `radar-jobs` profile. Run the API-image
`radar-job` with `--rm --no-deps -T`; its data mount is writable and its reviewed
inputs are read-only. The API sees only the read-only data mount. Optional host
timers are installed by Terraform but disabled until a real-data pilot passes.
See the [ingestion, monitoring and rollback runbook](../../docs/scraping/radar-operations.md).

Bulk DataMB tasks cannot assert a verified cohort: the current private adapter
has no authoritative population revision field. Keep their cohort null; use an
authorized frozen import for verified comparisons. Source schema errors quarantine
a task; blocking/rate-limit categories are recorded safely without provider bodies.
