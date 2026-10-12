# Pydantic/Zod migration follow-up review

Review date: 2026-10-12. Scope: the current uncommitted migration, including new
schema files, consumers, tests, generated artifacts, and enforcement configuration.

**Implementation status: LFB-012–LFB-021 are fixed.** The findings below retain the
original review evidence; the resolution table records the subsequent implementation.
The [migration record](schema-validation-migration-plan.md) now distinguishes its
historical baseline from the current inventory and representative parity checks.

## Follow-up resolutions

| Finding | Implemented fix and regression evidence |
|---|---|
| LFB-012 | Complete replacement body and both identifiers validate before DELETE; hook tests assert zero HTTP calls for invalid inputs |
| LFB-013 | String `startingWeek`, JSON catalog `lastStats`, dynamic loaned-player values and nested known fields align; declared alias collisions reject; shared fixtures check Python serialization and Zod parsing |
| LFB-014 | Catalog team identifiers constrain numeric strings; resolver tests cover bounded stale-cache fallback and sanitized route 502 |
| LFB-015 | Transport resolves routes and validates path/query contracts before fetch; all stats query models have matching bounds, date rules and repeated `include` serialization |
| LFB-016 | League cards reuse Manager, PlayerMarket and PlayerMaster DTOs; teams-master and statistics history validate provider DTOs before normalization |
| LFB-017 | Browser-session copies include known nested/config fields, reject unrelated root responses and preserve omitted lineup fields; independent shared-fixture tests enforce agreement |
| LFB-018 | Strict integer write amounts reject booleans, strings and fractions; route tests assert 422 with no upstream write |
| LFB-019 | Sanitized `ApiContractError` handles invalid success JSON; squad, market and lineup mutations refresh affected reads without write retries; hook regressions cover uncertain outcomes |
| LFB-020 | CI runs frontend tests and TypeScript build; hooks match API/auth/scraping schema sources; Markdown drift check, source-discovered naming checks and shared fixture corpus are enforced |
| LFB-021 | Updated phase assessments, auth/scraping endpoint inventory, shared-fixture scope and follow-up status |

Shared corpus: [`contracts/schema-validation-fixtures.json`](../../contracts/schema-validation-fixtures.json).
These cases establish agreement for the reported regressions and supported sparse
responses; they are not exhaustive proof of equivalence for every provider extension.

## Verification after fixes

- Auth: **352 passed**, **94.06% coverage** (90% gate).
- API: **406 passed**, **92.91% coverage** (90% gate).
- Scraping: **277 passed**, **88.21% coverage** (80% gate).
- Frontend: **369 passed**; ESLint, TypeScript checking and production build pass.
- Ruff, Black and `git diff --check` pass.
- All three OpenAPI snapshots and generated endpoint Markdown pass drift checks.
- No external services or live mutations were used.

The frontend build retains existing non-failing Rollup annotation and bundle-size
warnings. Provider history now rejects malformed samples before normalization;
write money fields require integer JSON numbers rather than coercing strings.

## Confirmed implementation

- The Python OpenAPI files declare success JSON schemas for all 70 JSON-capable
  operations: API 46, auth 14, scraping 10. JSON request bodies have schemas.
- The frontend registry covers all 46 API operations and 13 public Auth JSON
  operations. Private service-to-service contracts remain Python-only.
- The current naming checks pass: declared Python DTO fields use snake_case;
  declared Zod schema properties and identifiers use camelCase. Wire aliases and
  dynamic/protocol keys are separate from these naming conventions.
- All three OpenAPI snapshots match their current application generators. The
  endpoint schema Markdown matches its generator. `git diff --check` passes.

At review time, these declaration and registry checks passed despite the defects
below. The follow-up adds shared validation/serialization fixtures and consumer
regressions to check the reported behavior beyond schema presence.

## Original findings (historical evidence)

### LFB-012 — High: replacement listing is deleted before its replacement is validated

Location: [useSquadSales.ts](../../frontend/src/features/lineup/useSquadSales.ts),
lines 63–78.

`modifyListing` sends DELETE before checking the squad identifier and before
`postJson` runs the Zod listing-body validator. A valid existing listing can therefore
be removed even when the replacement fails local validation and is never posted.

Reproduced with the actual mutation function and a mocked HTTP transport:
`salePrice: 0` sent exactly one request, DELETE, then raised `ListingReplaceError`.
No live mutation was made.

Required change: validate the complete replacement body and identifiers before
DELETE. Add a behavior test that invalid replacement input sends no HTTP request.
This was explicitly required by the original plan.

### LFB-013 — High: Zod rejects valid Python response contracts

Locations: [API Zod schemas](../../frontend/src/api/schemas.ts), lines 235–264 and
341–357; [league schemas](../../backend/api/src/fantasy_api/schemas/leagues.py),
lines 240 and 256; [player schemas](../../backend/api/src/fantasy_api/schemas/players.py),
line 27.

Python declares `starting_week` as `str | None` and serializes it as `startingWeek`.
Both Zod team schemas require a number. Pydantic-produced team list/detail responses
containing `startingWeek: "1"` fail Zod parsing. This can put valid league/team reads
into the UI's error state.

There is further divergence: Python allows JSON values in catalog `lastStats`, while
Zod allows only objects. A Pydantic-produced catalog containing
`lastStats: ["opaque"]` fails Zod. The API alias adapter also accepts conflicting
`week_number` and `weekNumber` values instead of rejecting the ambiguity.

Required change: agree on the supported wire types, align both implementations,
reject alias collisions, and test shared valid/invalid serialized payloads. Registry
presence tests alone do not detect this drift.

### LFB-014 — High: malformed catalog team identifiers escape the provider error boundary

Locations: [PlayerResolver](../../backend/api/src/fantasy_api/services/player_resolver.py),
lines 56–69; [CatalogPlayer](../../backend/api/src/fantasy_api/schemas/players.py),
line 18.

`CatalogPlayer.team_id` permits any string. The resolver then calls `int()` outside
the validation/error boundary. A mocked catalog row with
`{"id":"7","teamId":"not-a-number"}` raises an unhandled `ValueError` from
`PlayerResolver.resolve`, rather than a sanitized `UpstreamError`. Stats routes
using the resolver can consequently return 500 for malformed provider input.

Required change: constrain/normalize numeric string identifiers through the
Pydantic contract or map conversion failures within the provider boundary. Test the
route response and stale-cache behavior.

### LFB-015 — Important: query validation is incomplete and can be bypassed

Locations: [API Zod schemas](../../frontend/src/api/schemas.ts), lines 716–727;
[API client](../../frontend/src/api/client.ts), lines 45–65 and 122–137;
[Python query models](../../backend/api/src/fantasy_api/schemas/player_stats.py),
lines 428–444 and 488–507.

The Zod player-detail query allows `limit` up to 60; Python limits it to 5. It also
omits the supported `include` list and Python's date-window rules. Reproduced:

- Zod accepts `limit: 6`, while Python rejects it.
- Zod accepts `to` without `from`, a preset with an explicit date range, reversed
  dates, and a date span exceeding 400 days; Python rejects each.
- Zod rejects valid `include: ["market"]`, and the path builder does not serialize it.
- Calling exported `getJson` directly with `?limit=61` still sends fetch; only the
  helper validates query inputs. An unregistered GET route is also fetched before
  schema lookup fails. DELETE has the same delayed schema lookup.

Required change: register and validate path/query inputs at the transport boundary,
mirror every supported query contract, add cross-field checks, serialize `include`,
and resolve the endpoint contract before sending any request.

### LFB-016 — Important: several Python nested/provider contracts remain shallow

Locations: [LeaguePlayer](../../backend/api/src/fantasy_api/schemas/players.py),
lines 49–51; [player stats service](../../backend/api/src/fantasy_api/services/player_stats.py),
lines 621–626 and 983–986.

Replacing `Any` with `JsonObject` checks JSON compatibility but not known nested
fields. `LeaguePlayer.manager`, `player_market`, and `player_master` still accept
arbitrary JSON objects instead of their field contracts. The controller helper
accepts `playerMaster: {marketValue: "broken"}`; the resulting Python response then
fails the frontend's nested numeric validation.

The teams-master and stats market-history consumers also still use raw dictionaries
and manual normalization instead of Pydantic wire DTOs. Their domain normalization
can remain, but the consumed HTTP payloads need an explicit schema boundary.

Required change: use endpoint-appropriate nested models for verified known fields,
keep genuinely dynamic extension maps explicit, and validate provider DTOs before
traversal/normalization.

### LFB-017 — Important: browser-session validation remains permissive and changes omitted fields

Locations: [browser-session HTTP helper](../../backend/auth/src/fantasy_auth/cli/browser_session/http.py),
lines 259–268; [local contracts](../../backend/auth/src/fantasy_auth/cli/browser_session/contracts.py),
lines 46–54 and 339–341.

Its read models have optional fields and allow extras, but the client lacks the
recognized-field guard used by the API controllers and API CLI. Reproduced: unrelated
objects are accepted by GET lineup and shield; `/leagues` accepts a list containing
only `{"unrelated":true}`. Model presence does not make these meaningful endpoint
responses valid. Several mirrored models also omit known API nested fields.

`validate_lineup_write` additionally dumps unset defaults. A caller body omitting
premium lineup fields gains `coach: null`, `captain: null`, and `bench: null` before
sending. Those explicit nulls are then forwarded by the API instead of preserving
the original omitted-field contract.

Required change: add endpoint-specific recognized-field/empty-body checks, align the
local contract copies, and serialize requests with `exclude_unset=True`.

### LFB-018 — Important: Python whole-number money checks still accept booleans

Locations: [market write models](../../backend/api/src/fantasy_api/schemas/market.py),
lines 89 and 105; equivalent buyout/money fields.

The Pydantic models use coercing `int` fields. Reproduced: `BidWrite(money=True)`
becomes `money=1`; `ListingWrite(salePrice=True)` becomes `salePrice=1`. Zod rejects
booleans. This leaves the original plan's explicit boolean rejection unimplemented.

Required change: use strict integer money fields, and make any intentional numeric
string support explicit. Add direct API invalid-body tests that prove no upstream
write occurs.

### LFB-019 — Important: failed response validation does not consistently reconcile mutations

Locations: [API client](../../frontend/src/api/client.ts), line 119;
[squad-sale callbacks](../../frontend/src/features/lineup/useSquadSales.ts), lines 32–49;
[market callbacks](../../frontend/src/features/market/actions/useMarketActions.ts),
lines 179–203.

Successful HTTP responses that fail parsing raise raw Zod errors; invalid JSON raises
an unrelated parse error. The planned dedicated response-contract error is absent.
Several mutation error callbacks only display an error or check reauthentication;
they do not refetch after a write may already have succeeded.

Reproduced: a mocked listing POST returned HTTP 200 with an unrelated object. The
real request/parser and error callback raised `ZodError` and performed zero refetches.
The server may already have created the listing, leaving displayed state stale and
the operation's outcome uncertain.

Required change: introduce a sanitized response-contract error, distinguish it from
preflight input errors, and refresh affected reads after uncertain mutation outcomes
without automatically retrying the write.

### LFB-020 — Important: planned enforcement is not wired into CI/hooks

Locations: [CI](../../.github/workflows/ci.yml), lines 31–41;
[pre-commit configuration](../../.pre-commit-config.yaml), lines 35–44;
[frontend coverage test](../../frontend/src/api/contracts.test.ts), lines 44–48.

CI installs frontend dependencies and runs ESLint, but does not run Vitest,
TypeScript checking, or the frontend build. Therefore the new Zod naming and endpoint
coverage tests are not CI gates. The scraping OpenAPI hook still misses scraping
`api/`, `parser/models/`, and `scraper/models.py`, despite those now contributing to
endpoint schemas. Generated endpoint Markdown is not checked for drift by CI.

The frontend coverage check only looks up a schema; it does not parse shared
Python-produced payloads or compare field constraints. Naming discovery is limited
to fixed file lists. The shared parity fixture corpus remains unimplemented.

Required change: wire frontend tests/type checking into CI, expand hook paths, check
generated Markdown drift, and add shared contract fixtures that catch the reproduced
type/validation differences.

### LFB-021 — Minor: the migration record overstates completion and retains stale inventory

Location: [migration record](schema-validation-migration-plan.md), lines 438–444
and 630–659.

Phases 2, 4, 5, 6, and 7 are marked complete despite the gaps above. The endpoint
inventory still labels implemented auth responses as generic dictionaries needing
migration, and the scraping facade as an `Any` route. Shared parity tests were moved
to a future enhancement even though the original validation matrix requested them.

Required change: mark outstanding work accurately, update the current endpoint
inventory, and distinguish completed declaration coverage from runtime equivalence.

## Original plan completion assessment (at review time)

| Plan area | Assessment |
|---|---|
| Endpoint inventory and declarations | Implemented; declaration/registry coverage is checked |
| Shared Python/Zod valid-invalid fixture parity | Missing |
| Python singleton/error boundaries | Mostly implemented; resolver conversion gap remains |
| Auth responses, strict request envelopes, scraping facade | Implemented |
| Known nested Fantasy models | Partial; several known blocks remain JSON dictionaries |
| TypeScript response schemas | Present; valid-response type differences remain |
| TypeScript input validation and mutation recovery | Partial; query rules, transport preflight, replacement ordering, and reconciliation remain |
| Provider and CLI consumers | Partial; browser-session guards/copies and provider DTOs remain |
| Current declared field naming | Passes snake_case/camelCase checks |
| Generated OpenAPI and endpoint Markdown | Current |
| CI, hooks, parity enforcement, and completion documentation | Partial |

## Verification performed for the original review

- Reran Python naming, endpoint coverage, and CLI contract tests: **4 passed**.
- Reran API/Auth frontend contract, naming, and client tests: **27 passed**.
- Compared application-generated OpenAPI with all three current files: **all match**.
- Compared generated endpoint Markdown with the current document: **matches**.
- Ran temporary Pydantic/Zod and mock-HTTP probes reproducing the findings above.
  Probes used synthetic data and no live provider calls or mutations.

The earlier full-suite and coverage results remain useful regression evidence;
they do not invalidate the reproduced defects. This review did not rerun every full
suite or change application code. At that point, the only repository change was this review record.
