# Real LALIGA club standings

`GET /competitions/{competition_id}/standings?mode=completed&season=2026`
returns the complete 20-club LALIGA table. The browser uses the same route
under `/api`. This classification is separate from Fantasy manager standings
at `/leagues/{league_id}/standing`.

## Availability and authentication

An auth-issued internal JWT is required, including on cache hits. LaLiga
pairing is unnecessary; no private bearer exchange occurs. API-Football is a
server-side provider-key integration with a fixed HTTPS origin, separate from
`LaligaFantasyClient`. There is no scraping fallback.

**Completed-match mode is implemented; in-match live standings are unavailable.**
`mode=live` (also the API default when mode is omitted) returns 503 with
`standings_live_unavailable`. Both CLIs and the frontend path helper explicitly
default to `completed`. No local ranking projection is enabled: authoritative
provider positions and points, including deductions, are preserved.

API-Football documents hourly updates to its standings method. See the
[provider guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
and [API reference](https://www.api-football.com/documentation-v3#tag/Standings).
The implementation has been verified with synthetic offline fixtures; an actual
current-season provider response and live-match observation still require a
configured key. Source update frequency is not a real-time guarantee.

## Configuration

Set these on the API service (locally in `backend/api/.env`; Compose already
loads that file and joins API to `public` for outbound HTTPS):

```dotenv
API_FOOTBALL_KEY=<API-Sports key>
STANDINGS_PROVIDER_LEAGUE_ID=140
STANDINGS_TIMEOUT_SECONDS=10
STANDINGS_TTL_SECONDS=3600
STANDINGS_CLUB_IDS={}
```

The key never reaches the frontend, CLI response, or auth service. The provider
plan must include the requested season; having a valid key alone is insufficient.
For example, the configured free plan observed during live diagnosis permitted
2022–2024 and rejected the active 2026 season. This is a provider entitlement
restriction, not an empty table or a reason to silently display historical data.
The exact permitted years depend on the provider's plan and can change.

The provider league id is independent of `LALIGA_COMPETITION_ID` (normally `1`); returned
metadata must identify Spain's La Liga. Only the configured application
competition is supported. `season` is its starting year (`2026` means `2026/27`),
bounded to 2000–2100. Omission resolves the single active season from provider
metadata, not the local calendar year. Unsupported seasons/competitions are 404.

Provider club ids map to Fantasy real-club ids using unique deterministic
`ClubDirectory` names/aliases. An ambiguous or missing match is a 502. Configure
verified provider-id to Fantasy-club-id overrides with `STANDINGS_CLUB_IDS` if
necessary; mappings must be positive and one-to-one for the returned season.
For example, `{"123":456}` means provider club 123 is Fantasy real club 456;
these example numbers are placeholders, not a verified club mapping.

## Data contract

Each `rows` entry requires:

| Field | Meaning |
|-------|---------|
| `team` | Real club `{id, name, badgeUrl}`; nullable badge |
| `position` | Authoritative rank from 1 to 20 |
| `points` | Authoritative league points, including adjustments |
| `played` | Finalized league games |
| `won`, `drawn`, `lost` | Finalized result totals |
| `goalsFor`, `goalsAgainst`, `goalDifference` | Goal totals and signed difference |
| `last5Matches` | Up to five finalized LALIGA results, oldest first |

Recent results contain `matchId`, `kickoffAt`, `opponent`, `venue`,
`goalsFor`, `goalsAgainst`, and `result` (`W`, `D`, `L`). Postponed, suspended,
scheduled, and in-progress matches do not enter completed totals or form.
Extra-time, penalty, and administrative win outcomes have no verified LALIGA
normalization here and fail explicitly. Pre-season rows have zero games and
empty form; fewer than five finalized games return exactly that many results.
The full fixture season is fetched in bulk, with bounded pagination, to verify
all club totals and derive form by kickoff chronology rather than matchweek.

`team.id` and `opponent.id` are Fantasy real-club ids, not manager team ids.
`matchId` uses `api-football:<id>` and cannot be joined to Fantasy calendar or
stats match ids by number alone.

Envelope fields: `competition`, `season`, `mode`, `rows`, `source`, `fetchedAt`,
`sourceUpdatedAt`, `generatedAt`, `cached`, `isProvisional`, `liveAvailable`.
`liveAvailable` is currently false. All timestamps serialize with UTC offsets;
`fetchedAt` is preserved on cache hits. `sourceUpdatedAt` is the oldest club
update in the complete table, or null if any club lacks an update timestamp.
It does not claim to measure provider latency. Python, auth CLI, and frontend
Zod contracts validate the same response using shared synthetic fixtures.

## Cache and failure policy

Snapshots are cached per season at least 3600 seconds, with single-flight
refresh. League metadata and Fantasy club identity use 24-hour caches. This
keeps one instance's warm requests off the provider; each worker has its own
cache, so quota planning must account for the number of deployed workers.

The frontend standings query also uses a one-hour freshness window and retains
unused data for one hour after the widget unmounts. This cache is scoped to the
signed-in user, survives route navigation and JWT refresh, and is cleared on
logout/session expiration. It is in-memory; a full page reload starts a new
client cache. The server's shared standings cache remains independent of session
lifetimes and still checks the caller's JWT before serving a cache hit.

Malformed JSON, unrecognized provider error envelopes (including HTTP 200 errors), wrong
competition/season, incomplete tables, conflicting fixtures, and unresolved
club ids return sanitized 502 `standings_error`. Upstream auth failures are
502, not a misleading app-user 401. Missing provider configuration, network
errors, provider rate limits, and provider 5xx return 503 `standings_unavailable`.
A provider `errors.plan` denial, even with HTTP 200, returns sanitized 503
`standings_plan_unavailable`. The widget explains that the data provider does
not cover this season. Configure a provider key with the required season access
and retry; the app does not change season or sources automatically.
Missing/invalid app JWT returns 401. Invalid parameters return 422.

Provider standings and fixture feeds can update at different times. If their
finalized results disagree at refresh, the API returns 502 rather than combining
old ranking/points with newer totals or form. Expired snapshots are not served
as fresh after a failed refresh; no retry loop or automatic source switching is
performed. Clients should show an unavailable state and allow a later retry.

## Read-only access

```bash
cd backend/api
uv run fantasy-standings --jwt "$INTERNAL_JWT" --season 2026 --json
```

Automated app login without LaLiga probing or pairing:

```bash
cd backend/auth
uv run fantasy-browser-session standings-analysis --season 2026 --json
```

The standalone CLI accepts the usual `--jwt`, session/CSRF, auth/API base flags,
plus `--competition-id`, `--season`, `--mode`, and `--json`.

## Remaining live-data work

Verify current-season responses with the configured provider key, then select
an authoritative live-standings API or verify a complete fixture-based
projection and current LALIGA tie-break rules. No key alone enables live mode.
The [implementation plan](../standings-implementation-plan.md) retains these
source/ranking gates. The [frontend plan](../../frontend-standings-implementation-plan.md)
places this table below Players Ranking with separate scrollable bodies.
