# Real LALIGA club standings: investigation and implementation plan

Status: completed-match API, CLI, and consumer contracts implemented on 2026-10-14.
Real provider verification requires a configured key; live support remains pending.
See the [feature contract](standings/README.md) and
[frontend plan](../frontend-standings-implementation-plan.md).

## Finding

The new `/competitions/{competition_id}/standings?mode=completed` method covers
the eleven requested fields. The investigation established that the existing
Fantasy league and calendar endpoints did not provide this contract.

- `GET /leagues/{league_id}/standing` and `/standing/{week}` rank Fantasy
  managers. Their `StandingRow` contains Fantasy points and manager/team metadata,
  not real clubs' played/won/drawn/lost and goal totals.
- `GET /calendar/weeks/{week}` exposes real-club fixture ids, scores, and state.
  `/calendar/weeks/{week}/stats` adds club metadata and player points. Neither
  returns a season league table or a last-five-match contract.
- The upstream catalog confirms `/api/v3/teams-master` for club identity but
  does not document a real-club standings route. This is not proof that an
  undocumented provider route cannot exist. Do not invent or probe guessed paths.

Repository evidence:
[Leagues](leagues/README.md), [calendar](calendar/README.md),
[OpenAPI](../../backend/api/openapi.json), and
[upstream catalog](../../.agents/skills/developing-endpoints/upstream-api-reference.md).

## Available external data

The [official LALIGA table](https://www.laliga.com/en-GB/laliga-easports/standing)
publishes positions, club names, points, games played, wins, draws, losses, and
goal totals. A website table alone does not establish a supported JSON API or
its update guarantees.

API-Football documents an actual API method:

```http
GET https://v3.football.api-sports.io/standings?league={providerLeagueId}&season={year}
x-apisports-key: <server-side key>
```

Its [provider guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
describes standings, recent form, fixture records, and live-score polling.
Its standings refresh hourly: this method alone cannot deliver an in-match
live classification. Provider credentials, current-season LALIGA coverage, and
actual responses have not been tested in this investigation.

The API-Football adapter is implemented, but its key/account is not provisioned
by this change. No scraping fallback is included. Source verification and a
verified live-data integration remain implementation gates.

## Application method

```http
GET /competitions/{competition_id}/standings?season=2026&mode=live
Authorization: Bearer <internal JWT>
```

The frontend calls `/api/competitions/...` through its existing same-origin proxy.

- Initially support the configured LALIGA competition only. `competition_id`
  is the app/Fantasy competition id, explicitly mapped to the provider id.
  Reject unsupported competitions with 404; do not pass arbitrary ids upstream.
- `season` is the season's starting year; `2026` denotes `2026/27`. Omission
  resolves the active season from verified provider competition metadata.
  A missing supported season returns 404; malformed query values return 422.
- `mode=live` is the default to satisfy the requested real-time behavior.
  `mode=completed` returns a table based only on finalized league results.
- Require the app JWT, as calendar does. Public/provider-key upstream data
  does not require LaLiga pairing or `/internal/laliga/bearer`.
- An unsupported live capability must fail explicitly with a documented 503,
  rather than quietly returning an hourly/completed table as live.

## Response contract

Use camelCase wire keys and typed Pydantic read models with `extra="allow"`.
All eleven fields below are required; unknown upstream fields do not relax
validation of the required contract.

| Requested data | Row field | Semantics |
|----------------|-----------|-----------|
| Team | `team` | `{id, name, badgeUrl}`; id is the real Fantasy club id; badge nullable |
| Ranking | `position` | Integer position, starting at 1 |
| Points | `points` | League points, including authoritative adjustments |
| Played games | `played` | Finalized games; includes ongoing games provisionally in live mode |
| Matches won | `won` | Wins under the selected mode |
| Matches tied | `drawn` | Draws under the selected mode |
| Matches lost | `lost` | Losses under the selected mode |
| Goals scored | `goalsFor` | Goals scored under the selected mode |
| Goals against | `goalsAgainst` | Goals conceded under the selected mode |
| Goal difference | `goalDifference` | `goalsFor - goalsAgainst`; signed integer |
| Last 5 matches | `last5Matches` | Up to five finalized LALIGA matches, oldest first |

`last5Matches` entries contain `matchId`, `kickoffAt` (UTC ISO 8601),
`opponent` (`id`, `name`), `venue` (`home`/`away`), `goalsFor`, `goalsAgainst`,
and `result` (`W`/`D`/`L`). Use fewer than five entries early in the season and
an empty list before the club's first finalized match. Ongoing games never
enter this list. This supports both form dots and the underlying match details.

The response envelope contains:

- `competition`: app id and name; `season`: starting year; `mode`.
- `rows`: the complete season participant list, ordered by position.
- `source`: safe provider name; `fetchedAt`: time of the upstream fetch,
  preserved on cache hits; `sourceUpdatedAt`: provider timestamp or null.
- `generatedAt`: time this response/projection was built; `cached`: boolean.
- `isProvisional`: true for a locally projected live table.
- `liveAvailable`: false until a verified live implementation is available.

Do not imply `fetchedAt` measures the provider's own update latency. Provider
fixture ids are namespaced strings; they are not calendar/stats match ids.

## Implementation sequence

1. **Verify the source before implementation.** Check an actual standings and
   bulk season-fixtures response for current LALIGA coverage, all required
   statistics, club identities, form ordering, final/live status codes, and
   timestamps. Verify a documented provider league id and season coverage.
   Capture sanitized fixtures for tests. Prefer a provider API that returns
   authoritative live standings directly. If only hourly standings are
   available, verify a live-fixture API and projection feasibility in step 4.
   Record quotas, credentials/configuration, and observed latency. Source
   selection remains the implementation dependency; no account purchase is
   included in this plan.

2. **Add the standings CRS domain.** Add `api/standings.py`,
   `services/standings.py`, `repositories/standings.py`, and
   `schemas/standings.py` in `backend/api/src/fantasy_api`. A dedicated provider
   client owns HTTP, provider-key headers, timeouts, sanitized failures, and
   lifecycle; do not send external-provider keys through `LaligaFantasyClient`.
   Wire the shared client/repository/service on `AppContainer`, close the client
   at shutdown, and register the router/OpenAPI tag in `main.py`. Validate the
   JWT before data access, including cache hits. Add secret-safe configuration,
   deployment env wiring, and verify outbound connectivity from the API service.
   Fixed provider origins and encoded path segments prevent caller-controlled URLs.

3. **Normalize and validate the complete table.** Map provider club ids to
   Fantasy club ids using teams-master, existing `ClubDirectory`, and explicit
   verified provider-id mappings. Never equate Fantasy-manager ids with club ids
   or rely on ambiguous fuzzy matches. Filter by competition and season. Load
   fixtures in bulk, follow pagination, and derive last-five details by actual
   kickoff date rather than matchweek (postponements can reorder games).
   Avoid twenty per-team calls on every request. Preserve authoritative ranking
   and point adjustments for provider tables. Verify the participant count from
   season metadata (normally 20), unique clubs/positions,
   `played = won + drawn + lost`, and goal difference. Missing required stats,
   unresolved club mappings, or truncated tables fail as sanitized 502 errors.
   Do not fabricate zeroes, missing form, or an empty successful table.

4. **Implement live semantics.** If no verified API supplies live standings,
   build a projection from reconciled finalized season fixtures and ongoing
   scores, while retaining verified point adjustments. Identify exactly which
   fixtures an authoritative baseline already includes; never blindly add live
   or newly finished matches onto an hourly snapshot. Rebuild deterministically
   from fixture ids/states so a final whistle, VAR correction, suspension, or
   resumed match cannot double-count. A live draw provisionally contributes a
   draw and one point; a live lead contributes a win and three points.
   Keep last-five results finalized-only. Before shipping projected positions,
   verify current LALIGA tie-break rules, including head-to-head and multi-club
   ties, against primary competition rules and provider examples. Do not assume
   points plus overall goal difference reproduces the official order. Mark the
   projected table provisional and retain the completed mode. If required source
   data or ranking rules cannot be established, live mode remains unavailable.

5. **Control freshness and quota use.** Cache by competition, season, and mode;
   reuse the existing single-flight TTL-cache pattern. Cache hourly provider
   standings at their documented cadence. Target a configurable 30–60-second
   live-fixture fetch interval during games only, subject to source quotas and
   verified latency; polling does not guarantee a source SLA. Reconcile finalized
   results promptly, reduce polling when idle, and refresh season metadata at
   season rollover. Calculate fleet-wide request use; process-local caches alone
   do not share quota across workers. On refresh failure return a sanitized error;
   any later stale-data feature needs explicit freshness/stale fields and limits.

6. **Add API-based CLI access.** Add a read-only `fantasy-standings` command with
   shared auth arguments and competition/season/mode/JSON flags. Register its
   entry point and add a `fantasy-browser-session` command using automated app
   login without mandatory LaLiga pairing for this provider read. Update its
   response validation contract. Auth calls the API over HTTP and does not import
   `fantasy_api` or the scraping service.

7. **Verify behavior and publish the contract.** Add route/client tests using
   `httpx.MockTransport`: correct URL/query/provider-key headers; missing/invalid
   JWT; no LaLiga bearer exchange; bad JSON/shape/provider error envelopes even
   on HTTP 200; rate limit/timeout/non-2xx failures; no secret/body leaks; unsupported
   competition/season; identity mismatch; pagination and incomplete tables.
   Cover pre-season zero-game rows, fewer than five results, postponements,
   simultaneous games, ties, point adjustments, score corrections, suspension,
   final-whistle reconciliation, and concurrent cache misses. Compare normalized
   tables with sanitized provider snapshots and the official table, including a
   real live observation before claiming live support. Follow repository test
   naming and Arrange-Act-Assert sections. Run API lint/type checks and the API
   coverage suite; run auth tests for browser-session changes.

## Documentation and generated artifacts

Add a feature README describing availability, authentication, field meanings,
provider dependence, ids, errors, and freshness. Link it from the API/docs indexes,
add the domain to the architecture table, and update API/auth service READMEs for
the new CLI flow. After route/schema implementation run:

```bash
uv run poe generate-openapi
uv run poe generate-endpoint-schemas
cd backend/api && uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80
cd ../auth && uv run pytest
```

Commit generated `backend/api/openapi.json` and `docs/api/endpoint-schemas.md`;
do not hand-edit the generated schema documentation. These generators/tests are
implementation checks for the new API route. They do not verify real provider
coverage without a configured key.

The completed-match implementation returns all eleven fields for twenty clubs,
preserves provider rank/points, validates identities and totals, and exposes CLI
access. Mocked validation covers this contract. The original in-match real-time
requirement remains pending actual source verification and a suitable live API
or verified projection. It is not satisfied by the hourly table.
