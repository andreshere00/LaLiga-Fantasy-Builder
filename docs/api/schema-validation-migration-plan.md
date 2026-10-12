# Pydantic and Zod compliance audit and migration record

Baseline audit: 2026-10-11. Source baseline: `c2df631`.
Implementation verified: 2026-10-12.
Status: **migration implemented; runtime and naming checks are in place**.
The first sections retain the baseline findings for traceability; the implementation
record below describes the current contract and verification state.

## Scope and acceptance standard

The requirement applies to HTTP data contracts: request bodies, path/query inputs,
success bodies, error bodies, and DTOs used by Python and TypeScript HTTP consumers.
The audit covers `backend/api`, `backend/auth`, `backend/scraping`, their HTTP clients
and CLI consumers, and `frontend/src`. Framework-provided docs routes are excluded
from the application route counts.

A compliant contract has both a schema and runtime validation:

- Python structured request/response DTOs use Pydantic `BaseModel`, `RootModel`, or
  typed collections validated with `TypeAdapter`. Route output declarations and
  actual serialization agree. Direct JSON responses validate their contents first.
- TypeScript contracts use Zod schemas, derive their data types through `z.infer`
  (or `z.input`/`z.output` for transforms), and parse external data before it enters
  application state. Outgoing bodies and endpoint parameters validate before sending.
- Declared Python model attributes use `snake_case`; declared Zod DTO properties
  use `camelCase`. Aliases and explicit boundary adapters preserve existing wire
  names where those names differ from the language's field convention.
- Known nested fields validate recursively. Dynamic extension maps have explicit
  JSON value contracts; an empty model or `Any` is not evidence of field validation.
- Invalid caller input returns 422 where FastAPI currently uses 422. Invalid upstream
  JSON or fields become sanitized provider errors, normally 502. Bugs in locally
  constructed output remain server errors; do not relabel every exception as 502.
- Write DTOs reject unknown fields. Fantasy read DTOs preserve unknown fields using
  `FlexibleModel` / `extra="allow"`; corresponding Zod read objects retain extras.
- Redirects and responses with no body declare their status/header contract without
  inventing a JSON body. FastAPI/Starlette `Request`, `Response`, `JSONResponse`,
  `RedirectResponse`, Fetch `Response`, and HTTP client classes remain transport
  objects. Internal containers, caches, and domain dataclasses are not endpoint DTOs
  merely because an endpoint uses them.

FastAPI already validates annotated scalar path/query/header parameters through its
Pydantic integration. Those parameters are not automatically violations. Introduce
named query models where parameters form a reusable contract or require cross-field
validation, following the existing player-stats pattern.

## Implementation result

All JSON success operations in the three Python services now have named Pydantic
response contracts, and all JSON request-body operations have typed request
contracts. Direct JSON branches and error responses are validated before they are
returned. The frontend validates all 46 main-API JSON success operations through
endpoint-specific Zod schemas. Its auth schemas cover every public Auth JSON success
operation, including pairing and health contracts, and the auth client parses the
session, token, connection, acknowledgement, and error responses it consumes. Provider
adapters and the API/auth/scraping CLIs also validate their consumed HTTP payloads.

| Check | Implemented coverage |
|---|---|
| Python endpoint JSON success bodies | API 46/46, auth 14/14, scraping 10/10 |
| Python JSON request bodies | API 10, auth 2, scraping 3; write envelopes forbid extras |
| Frontend API response contracts | Zod registry covers all 46 API operations |
| Frontend public Auth response contracts | Zod registry covers all 13 public Auth JSON operations; private bearer exchange remains Python-only |
| Frontend API request inputs | Zod validates all declared bodies, queries, and path segments before fetch |
| Frontend public Auth request inputs | Zod covers both JSON bodies, callback query values, and pairing path identifiers |
| Browser-session API client | Route-keyed Pydantic input/output validation for every consumed API route |
| Python schema field naming | AST test enforces snake_case across service DTO modules |
| Zod schema naming | TypeScript AST test enforces camelCase schema identifiers and object properties |
| OpenAPI and endpoint reference | All three OpenAPI documents and the generated endpoint schema reference are current |

Python names use snake_case with explicit aliases preserving existing wire keys;
Zod properties use camelCase with schema-aware inbound/outbound mapping. Read DTOs
retain permitted upstream extension fields, write DTOs reject extras, and malformed
upstream/provider payloads fail through sanitized service errors. The browser-session
CLI keeps its API contracts local to auth rather than importing the API package.

The frontend Zod registries cover all main-API operations and all public Auth JSON
operations. Private service-to-service bearer exchange and scraping contracts remain
Python-only because no TypeScript client consumes them. The implementation uses
OpenAPI-backed coverage tests rather than a separate generated endpoint manifest;
shared cross-language valid/invalid fixtures now enforce the reported regressions
and Pydantic wire serialization.

Applied repository skills: [code review](../../.agents/skills/code-review/SKILL.md),
[Python best practices](../../.agents/skills/coding-style/SKILL.md),
[React frontend](../../.agents/skills/react-frontend/SKILL.md), and
[developing endpoints](../../.agents/skills/developing-endpoints/SKILL.md).
Architecture, endpoint-development, proxy-pitfall, authentication, and domain guides
inform the plan and its compatibility constraints.

## Baseline coverage snapshot (before implementation)

Counts were checked against route decorators and all three committed OpenAPI files.
They measure named model declarations, not complete semantic validation.

| Surface | Application operations | Operations with a JSON success branch | Explicit Pydantic success model | Assessment |
|---|---:|---:|---:|---|
| Main API | 46 | 46 | 46 | Models present; incomplete nested validation and error mapping |
| Auth | 16 | 14 | 4 | Ten JSON-capable operations lack a named response model; two pure redirects |
| Scraping | 10 | 10 | 9 | Parsed-player facade has no declared response model |
| Total Python | 72 | 70 | 59 | Eleven JSON success contracts need declarations |
| Frontend | Two HTTP client modules | All consumed JSON endpoints | Zero Zod imports in source | No Zod runtime boundary validation |

All **15 request-body operations** use Pydantic: ten API operations, two auth
operations, and three scraping operations. They use 14 distinct request models
because bid creation/update share `BidWrite`. API and scraper write models forbid
extras; both auth request models currently use Pydantic's default extra handling.
Six player-stats routes also use named Pydantic query models with bounds, enums,
and date-window validation.

Pydantic is installed and actively used across the Python services. The frontend
has Zod 4 in lockfiles through development tooling, but has no direct runtime Zod
dependency in `package.json` and no source schema/validation integration. A transitive
installation does not meet the requirement.

Existing good patterns to retain: `FlexibleModel`, strict API write DTOs,
`as_model_list` mapping Pydantic failures to `UpstreamError`, player-stats query
validators and typed segment responses, and the scraper's nested parser models.

## Baseline naming convention audit (before implementation)

The follow-up naming review checks declared data properties, including nested and
request models. Python model class names and TypeScript type names may remain
`PascalCase`; Zod schema variables should use `camelCase`, such as
`playerResponseSchema`. Wire aliases, enum values, error codes, and keys in dynamic
maps are assessed separately from declared DTO property names.

An AST inventory followed Pydantic model inheritance across each service's source.
These counts cover data-model classes, including bases and parser models; repeated
inheritance is not counted again as a field declaration. A repeated declaration in
one class counts once. Settings models are excluded from the table; their fields
also use snake_case.

| Python surface | Data model classes | Declared fields | Fields violating snake_case | Affected classes |
|---|---:|---:|---:|---:|
| Main API | 104 | 506 | 124 | 35 |
| Auth | 6 | 19 | 0 | 0 |
| Scraping | 88 | 494 | 0 | 0 |

All 124 violations are camelCase attributes in six main-API schema files. They are
Python attributes mirroring upstream keys directly, rather than snake_case
attributes with aliases:

| API schema file | Non-snake_case fields | Examples |
|---|---:|---|
| `schemas/leagues.py` | 73 | `managerName`, `teamMoney`, `playerTeamId`, `buyoutClause` |
| `schemas/calendar.py` | 20 | `isLive`, `weekNumber`, `matchDate`, `localScore` |
| `schemas/players.py` | 16 | `positionId`, `marketValue`, `playerMaster` |
| `schemas/teams.py` | 5 | `teamMoney`, `teamInvestment`, `tacticalFormation` |
| `schemas/market.py` | 5 | `playerId`, `salePrice`, `offerMoney` |
| `schemas/buyout.py` | 5 | `buyoutClauseToPay`, `rewardedAdType`, `rewardedAd` |

The API's common, player-stats, and scraped-wire model fields already use
snake_case. Auth and scraping declared model fields also comply. Scraping
`parser/models/base.py:7` provides the existing pattern: snake_case Python
attributes with `to_camel` aliases and alias-based JSON serialization. Its camelCase
JSON is compatible with the Python naming requirement.

There are **no Zod schemas in application source**, so camelCase Zod compliance
cannot yet be established. The existing TypeScript contracts mix conventions:
`auth/types.ts` has nine snake_case properties (`user_id`, `csrf_token`,
`access_token`, `token_type`, `expires_in`, `expires_at`, `needs_reauth`,
`manager_id`, `manager_name`); `PlayerStatsDetailQuery` has `include_weather` and
`include_stats`. The lineup request builder also emits `tactical_formation`.
These are current wire names, not existing Zod schema violations. Their replacement
Zod DTO properties need camelCase names and explicit wire mappings.

## Baseline findings (audit-time evidence)

The `Action` paragraphs below record the proposed remediation at audit time. Their
current implementation state is:

| Finding | Status |
|---|---|
| LFB-001 — auth client assertions | Resolved with auth Zod schemas and parse-before-store checks |
| LFB-002 — API TypeScript boundaries | Resolved with endpoint-specific request/response Zod schemas |
| LFB-003 — singleton provider errors | Resolved with shared Pydantic validation/error mapping and route tests |
| LFB-004 — credential response coercion | Resolved with strict API-local Pydantic validation |
| LFB-005 — shallow nested response models | Resolved for declared Fantasy fields; extension maps use recursive JSON value types |
| LFB-006 — auth response/request contracts | Resolved with named response and strict request models |
| LFB-007 — scraping facade and batch outcomes | Resolved with typed route and batch DTOs |
| LFB-008 — unvalidated error bodies | Resolved with service-owned Pydantic error models and Zod frontend errors |
| LFB-009 — provider and CLI boundaries | Resolved with provider, API CLI, auth CLI, browser-session, and remote-scraper validation |
| LFB-010 — Python field names | Resolved with snake_case attributes and alias serialization |
| LFB-011 — Zod field names | Resolved with camelCase schema properties and schema-aware wire adapters |

### LFB-001 — High: auth client assertions bypass runtime validation

Evidence: `frontend/src/auth/client.ts:61`, `:75`, `:102` and
`frontend/src/auth/types.ts:1`.
`SessionView`, `AccessToken`, and `LaligaConnection` are handwritten types;
successful JSON is asserted into them. `exchange()` stores `access_token` after a
cast, with no checks on the token, expiry, or token type. `logout()` checks status
but does not validate its JSON acknowledgement.

Action: add auth Zod schemas and inferred types; parse before storing tokens or
updating auth state. Preserve the existing session-401 behavior and cancellation.

### LFB-002 — High: API requests and responses have no Zod contracts

Evidence: `frontend/src/api/client.ts:90`, `:110`, `:129`, `:148`, `:165`;
`frontend/src/api/mappers.ts:287`, `:316`, `:369`;
`frontend/src/features/lineup/lineupDraft.ts:368`.
Transport helpers return `unknown`, accept `unknown` write bodies, and manually
inspect error JSON. Returning `unknown` is appropriate inside a transport layer,
but every current caller can proceed without schema validation. Mappers filter
bad rows or convert invalid payloads to empty arrays/objects. The lineup builder
returns `Record<string, unknown>`; market/buyout bodies are assembled inline.

Action: require endpoint-specific schemas in typed endpoint functions. Parse before
React Query caching, then map validated DTOs into UI views. Keep UI business rules
such as spending limits alongside schema checks.

### LFB-003 — High: singleton Pydantic errors escape the upstream error boundary

Evidence: `backend/api/src/fantasy_api/api/calendar.py:39`, and equivalent
`model_validate(parse_payload(...))` expressions in teams, players, leagues,
market, and buyout controllers. Compare `api/payload.py:12` and
`services/payload.py:12`.
The shared parser catches shape errors, but singleton model validation occurs
afterward. A mocked upstream `{"weekNumber":"broken"}` at `GET /calendar/current`
returns **500**, while the repository rule requires a sanitized upstream error.
List validation already catches Pydantic failures in `as_model_list`.

Action: place normalization and field validation inside the same provider-specific
error boundary for single objects and collections. Add route-level negative tests.

### LFB-004 — High: credential response DTO uses unsafe manual coercion

Evidence: `backend/api/src/fantasy_api/clients/auth_credentials.py:13`, `:89`, `:96`.
The HTTP response becomes a standard `LaligaBearer` dataclass through `str()` and
`int()`. A mock `{"bearer_token":null,"expires_at":true}` is accepted as token
`"None"` and expiry `1`; `{}` raises `KeyError`, and `[]` raises `TypeError`.
The producer's `LaligaBearerResponse` does not protect a consumer from malformed
responses.

Action: use an API-local Pydantic credential wire model and validate successful JSON
before use. Reject invalid token/expiry types, map failures to `auth_error`, and keep
the token private. Do not import auth implementation modules into the API.

### LFB-005 — Important: several response models validate only the outer object

Evidence: API `schemas/market.py:10`, `:20`, `:24`; `schemas/buyout.py:10`, `:14`;
`schemas/teams.py:22`; `schemas/players.py:12`, `:39`; `schemas/leagues.py:183`.
`MarketSnapshot`, `PlayerTeamOffers`, mutation results, and `ShieldStatus` have no
declared fields. Lineup slots, player images/stats, and several nested player blocks
use `Any` or arbitrary dictionaries. Many read models have only optional fields.

Confirmed probes: `MarketSnapshot` accepts `marketPlayers` as a string and
`userBids` as a number. `GET /calendar/current` accepts `{"unrelated":true}` as
200. The generic collection normalizer treats an unrelated dictionary as a
singleton row (`schemas/payload.py:57`, `:96`).

Action: define verified nested schemas and endpoint-specific envelope/identity
checks. Preserve documented sparse responses, valid empty mutation acknowledgements,
and market `null` normalization. Require meaningful identifying fields only where
fixtures establish the contract; do not make every optional field mandatory.

### LFB-006 — Important: auth JSON contracts and strict request checks are missing

Evidence: auth `api/auth.py:77`, `:131`, `:154`; `api/internal_auth.py:47`;
`api/pairings.py:28`, `:69`, `:96`, `:156`, `:222`; `main.py:134`.
Ten operations lack named JSON response models: callback's JSON branch, logout, me,
JWKS, both pairing completions, unlink, and three health operations. Dictionaries
with inferred FastAPI output types validate only their broad container/value types.
`PairingCompleteRequest` and `CompleteRedirectRequest` silently ignore extra keys;
the former leaves `token_response` as `dict[str, Any]`.

Action: create auth-owned session, acknowledgement, pairing-completion, JWKS, and
health schemas; validate direct-response branches; forbid request-envelope extras
and model the B2C token payload with documented provider extensions.

### LFB-007 — Important: scraping facade omits its existing typed contract

Evidence: `backend/scraping/src/fantasy_scraping/api/players.py:47`, `:68`;
`services/player_document.py:30`; `scraper/models.py:80`.
`GET /internal/players/futbolfantasy` returns `Any` and dumps an existing
`FutbolFantasyPlayer`. The parser already constructs Pydantic data, so this is a
route declaration/OpenAPI gap, not an entirely unvalidated parser response.
Batch `ScrapeOutcome.error` is also an arbitrary dictionary.

Action: declare and return the existing player model, preserving aliases; introduce
a typed batch-item error DTO and typed ambiguity candidates.

### LFB-008 — Important: error schemas are not used to construct error bodies

Evidence: API `schemas/common.py:8`, `main.py:106`; auth `main.py:157`;
scraping `main.py:98`.
The API has `ErrorResponse` in OpenAPI metadata but builds dictionaries in exception
handlers. Auth and scraping also return dictionary-backed `JSONResponse` objects.
Auth provider failures may omit `detail`; scraping ambiguity adds `candidates`.
Framework HTTP/422 responses have another `detail` shape.

Action: validate each actual error variant through service-owned Pydantic schemas,
and add matching Zod error unions for browser contracts. Document statuses and
variants accurately. Declaring `responses={...}` alone does not validate a handler.

### LFB-009 — Important: provider and CLI boundaries need schema validation

Evidence: API `services/wire_map.py:72`, `clients/openweather.py:43`,
`cli/common.py:133`, `:144`; auth `adapters/fantasy_httpx.py:26`,
`adapters/b2c_httpx.py:158`, `application/sessions.py:247`,
`cli/browser_session/http.py:23`, `:52`, `:91`;
scraping `scraper/remote.py:70`.
Several HTTP consumers parse JSON and access/coerce fields manually. The scraping
wire mapper normalizes before validating; malformed `matches`, `fixtures` rows,
or `profile` produce `AttributeError` before `FutbolFantasyWire.model_validate`.
The provider catches Pydantic errors, so these earlier failures bypass that path.

Action: validate provider wire shapes before traversing them and normalized models
afterward. Add endpoint-aware validation to CLI consumers. Client/service classes
may keep their existing implementation style; their HTTP DTOs must be Pydantic.

### LFB-010 — Important: API Pydantic field names do not consistently use snake_case

Evidence: API `schemas/leagues.py:88`, `:218`; `schemas/calendar.py:13`;
`schemas/players.py:19`; `schemas/teams.py:18`; `schemas/market.py:50`;
`schemas/buyout.py:23`. The naming inventory identifies 124 camelCase fields in
35 classes, including request DTOs. For example, `SquadPlayer.playerTeamId` should
be `player_team_id` with the `playerTeamId` wire alias.

Action: rename Python attributes and constructors, configure explicit provider
aliases, and test alias-based serialization. Existing controllers call
`body.model_dump(mode="json")` without `by_alias=True` (`api/market.py:185`,
`api/buyout.py:68`, `api/teams.py:137`). Renaming fields without updating those calls
would send snake_case keys to upstream routes that expect camelCase.

### LFB-011 — Important: Zod migration needs an explicit camelCase naming boundary

Evidence: `frontend/src/auth/types.ts:2`, `:9`, `:13`, `:21`;
`frontend/src/api/client.ts:10`; `frontend/src/features/lineup/lineupDraft.ts:377`.
No Zod schemas exist, and current TypeScript auth/query DTOs directly expose
snake_case wire properties. Copying those types into Zod would preserve the naming
inconsistency. Existing consumers such as `AuthProvider.tsx:69` also access these
snake_case properties.

Action: define camelCase Zod DTO properties and update consumers together. Explicit
adapters map legacy snake_case JSON/query/body names to those DTOs and back. Record
the mapping in the contract manifest and validate mapped values before use.

## Adopted contract design

Pydantic models remain the Python source of truth, with committed OpenAPI describing
the serialized wire contracts. Add domain Zod schemas directly to the frontend and
derive TypeScript DTOs from them. Use shared sanitized fixtures and an endpoint
coverage manifest to check parity. This plan uses explicit Zod schemas; a generator
is not required for the first migration and cannot replace cross-field validators.
For legacy wire names, parity compares the encoded/decoded contract after explicit
name mapping; Python and TypeScript internal property names intentionally differ.

Suggested layout:

| Location | Responsibility |
|---|---|
| API `schemas/common.py`, `schemas/<domain>.py` | Request, response, nested wire, and error models |
| Auth `schemas/` | Auth DTOs currently defined inline, plus missing public/private contracts |
| Scraping `schemas/` | HTTP envelopes/errors; reuse parser and scraper models |
| Frontend `auth/schemas.ts` | Session, internal token, connection, auth acknowledgements |
| Frontend `api/schemas/<domain>.ts` | Public API bodies, paths/queries, responses, nested models, errors |
| Frontend `api/endpoints.ts` and `api/client.ts` | Typed endpoint functions over private raw transport |
| Proposed `contracts/fixtures/` and `contracts/endpoints.json` | Python/Zod valid-invalid parity and coverage; method, path, status, input/output schema, and consumer mapping |

Every public application JSON contract gets a Zod entry in the manifest, including
currently unused public routes. Private Python-only credential/scraping contracts
stay out of the browser bundle; any future TypeScript consumer must supply Zod
validation for them. Do not expose secret contracts through a frontend barrel export.

Validation rules:

- Retain Python `extra="allow"` on Fantasy reads. Zod 4 `z.looseObject` retains
  extra fields; `z.strictObject` rejects write extras. Known fields remain typed.
  Use Pydantic `JsonValue` / Zod `z.json()` for truly opaque JSON extension values,
  with an explicit reason for each such field rather than unconstrained `Any`.
- Rename Python camelCase attributes to snake_case and preserve upstream wire keys
  through aliases. Define camelCase Zod DTO properties and explicit adapters for
  existing snake_case wire contracts. Apply the mapping to nested declared fields.
- Model omitted and nullable fields separately using the actual serialized output.
  Proxy routes often exclude `None`; stats routes retain nulls. Validate JSON dates
  as strings at the TypeScript wire boundary, then transform into UI representations.
- Preserve current string/integer identifier variants. Keep master `playerId` and
  squad-entry `playerTeamId` distinct, including misleading upstream body names.
- Mirror numeric bounds, enums, required lineup replacement fields, query aliases
  such as `from`, repeated query values, and player-stats date-window rules in Zod.
  Include `PlayerDetailQuery.include`, currently missing from the TS query type.
- Reject booleans/fractional/non-finite values where whole-number money is required.
  Handle numeric strings only where the contract explicitly supports them. Review
  and document any tightening of currently permissive coercions.
- Model documented empty acknowledgements explicitly. Handle actual no-body statuses
  separately; do not make malformed JSON or a bad GET look like an empty success.
- Validate before token storage, caching, optimistic mutation updates, or traversal
  of provider data. Keep presentation fallbacks for valid missing data.
- Preserve JWT signature/issuer/audience/subject verification and CSRF checks.
  Pydantic/Zod field checks complement those checks.
- Keep token fields out of representations/logs. Sanitize validation diagnostics;
  never return raw payloads or `str(ValidationError)` containing secret input.
  Authorized token endpoints must still serialize their actual wire tokens.

### Naming and wire compatibility

Keep the current HTTP contracts stable during the field-name migration. Do not
apply a camelCase alias generator globally to `FlexibleModel`: player-stats DTOs
inherit that base and currently serialize snake_case keys. Use explicit aliases
or a dedicated Fantasy wire-model base for the upstream camelCase contracts.
Auth and scraping also retain their respective current JSON formats.

| Python attribute | Zod DTO property | Existing wire key |
|---|---|---|
| `player_id` | `playerId` | `playerId` on affected mutation bodies |
| `player_team_id` | `playerTeamId` | `playerTeamId` on squad entries |
| `buyout_clause_to_pay` | `buyoutClauseToPay` | `buyoutClauseToPay` |
| `access_token` | `accessToken` | `access_token` on auth token responses |
| `include_weather` | `includeWeather` | `include_weather` query parameter |
| `tactical_formation` | `tacticalFormation` | `tactical_formation` on lineup writes |

Record `python_name`, `typescript_name`, and `wire_name` per declared field in the
manifest. Use the serialized OpenAPI keys as the wire reference. Renaming a public
wire key is a separate contract change and requires coordinated clients/docs.
External OAuth/B2C fields, JWT claims, error-code strings, enum values, and dynamic
dictionary keys retain their protocol-defined spelling.

Inbound TypeScript adapters map only declared legacy properties, preserve allowed
extensions, and pass unknown values to camelCase Zod schemas for validation before
state/cache updates. Outbound adapters encode validated camelCase DTOs into the
current wire names. Test malformed nested values and name collisions; do not use
a blind recursive case converter that can alter dynamic maps or merge distinct keys.
Zod shape declarations remain camelCase; legacy snake_case strings belong to the
adapter mapping, not to duplicate application DTOs.

For Python, test both alias parsing and actual HTTP/upstream serialization. Audit
every model dump after renaming: use alias-based dumps where a wire payload is
required and snake_case dumps for internal model data. Preserve exact exceptions
such as `tactical_formation` and `from` with explicit aliases. Strict write DTOs
must keep rejecting unknown fields; define and test accepted alias/name forms rather
than silently broadening the public request contract.

## Implementation sequence and status

The initial completion assessment was corrected by the
[follow-up review](schema-validation-follow-up-review.md). LFB-012–LFB-021 are now
implemented with regression coverage. The baseline sections above describe the
pre-migration state; the endpoint inventory below describes the current state.
Declaration coverage and shared fixture equivalence are separate checks. The shared
corpus covers the reported type, alias, integer, sparse-body and query mismatches;
it is representative coverage, not a proof for every possible provider extension.


| Phase / proposed change | Files and work | Depends on | Completion criteria | Status |
|---|---|---|---|---|
| 1. Establish contract inventory | Use committed OpenAPI as the route inventory; add endpoint coverage checks and focused valid/invalid contract tests. | Audit | All Python JSON success operations and public TypeScript contracts are counted and checked | Complete; OpenAPI-backed registry tests serve as the inventory |
| 2. Fix Python validation boundaries | Extend shared object/list validation; migrate singleton controllers; convert credential wire DTO; validate scraping raw shape before normalization; add validated service-local error builders. | 1 | Malformed upstream JSON/fields map to sanitized errors; local output bugs remain server errors | Complete |
| 3. Complete auth and scraping contracts | Add missing auth response declarations and scraper facade model; move auth DTOs into schemas; forbid request extras; type provider and batch-item contracts. | 1, 2 | All 70 JSON-capable operations have named Pydantic success contracts; direct JSON branches validate | Complete |
| 4. Model nested Fantasy reads | Extend market/buyout, lineup, catalog, league-card, stats/image, and scraped-wire models; validate endpoint envelopes and retain documented sparse/null cases. | 1, 2 | Known nested fields reject wrong types; unrelated envelopes fail | Complete |
| 5. Migrate TypeScript boundaries | Add direct Zod dependency; define inferred auth/API schemas; validate responses, errors, bodies, paths, and queries before use. | 1; final parity against 3, 4 | All 46 API and 13 public Auth JSON operations have Zod coverage; invalid inputs block fetch and invalid responses do not enter state | Complete |
| 6. Migrate provider and CLI consumers | Type B2C/OIDC/Fantasy manager/weather responses and CLI consumers, including browser-session and remote scraper boundaries. | 2–4 | Consumed payloads validate before access; malformed CLI data fails safely | Complete |
| 7. Enforce and document | Add coverage and naming checks; regenerate OpenAPI/schema docs; document the migration; run backend/frontend checks. | 3–6 | Generated contracts are current and language naming checks pass | Complete after follow-up fixes; shared valid/invalid and serialized fixtures run in Python, Zod and browser-session tests |

Python field renaming and alias serialization were integrated into phase 4; new
DTOs use snake_case attributes. Phase 5 added camelCase Zod properties, schema-aware
wire adapters, and caller updates. OpenAPI and runtime tests record and enforce the
wire contract without a separate field-mapping manifest.

For phase 5, migrate callers in this order: auth client; league selection and shared
queries; lineup board; market board/actions and squad sales; players board/detail.
Call sites include `LeagueProvider`, `useLineupBoard`, `useSquadSales`,
`useMarketBoard`, `useMarketActions`, `usePlayersBoard`, `usePlayerMarketListing`,
and `PlayerDetailPage`. Remove network-shape casts and invalid-row filtering as
each caller moves to validated DTOs. UI-only view types can remain ordinary types.

Use a distinct frontend contract error for invalid success JSON. It must propagate
through React Query's error state without treating the response as empty data or
marking a user as `needs_reauth`. Preserve validated `needs_reauth` handling on 401.
Malformed error JSON keeps its HTTP status and a generic safe error category;
schema failures must not expose its raw contents or suppress a success-body failure.
Do not automatically retry mutations when response parsing fails: the upstream
write may already have succeeded. Refresh reads to reconcile uncertain state.
For listing replacement, validate the entire proposed replacement before its first
DELETE, then keep the existing recovery behavior if the following POST fails.

Contract tightening must ship with the corresponding valid sparse/legacy cases.
Backend normalized wire behavior should be established before frontend schemas are
made stricter. Changes to accepted provider shapes require fixture evidence; do not
run real market or buyout writes to discover response shapes. CLIs remain read-only.

## Verification matrix and enforcement

The matrix below defines the behavior expected at each boundary. The coverage and
naming checks described in the implementation result are committed; the matrix also
records useful regression cases for future contract additions.

| Boundary | Required behavior tests |
|---|---|
| Python requests | Missing required values, extra fields including nested extras, wrong types, limits, enum/date/query combinations; invalid input never calls upstream |
| Python upstream | Non-JSON 200, wrong root shape, wrong nested field, unrelated wrapper, missing identity where required, malformed credential fields; sanitized provider error with no tokens |
| Python serialization | Validate actual HTTP bodies for success/error status variants; aliases/null omission, cookie rotation/deletion, callback 302, health 503, JWKS public fields |
| Zod responses | Valid data parses; malformed roots/rows/nested fields reject before token/cache updates; extras are retained on reads; allowed sparse/empty data succeeds |
| Zod requests | Request body/path/query failures prevent fetch; bounds and cross-field rules match Python; separate master/squad IDs; whole replacement validated before DELETE |
| Aggregated stats | Valid 200 with `segment_errors` and missing/null failed segments parses; successful segments remain visible; unavailable weather remains a valid state |
| Consumers | Mock HTTP clients and CLI transports return malformed data; explicit failure replaces coercion, empty-result fallback, or uncaught exceptions |
| Contract parity | Shared valid/invalid cases pass/fail in Python and Zod; compare serialized aliases, omitted/null fields, numbers, unions, enums, and extra-field behavior |
| Naming | Python model attributes are snake_case; Zod declared DTO properties and schema variables are camelCase; adapter round trips preserve nested keys, aliases, dynamic maps, and strict-write behavior |

Add a route coverage check for a named Pydantic response DTO (or an explicit
redirect/no-body designation), error variants, and request-body DTOs. Test direct
response paths because declarations alone cannot prove runtime validation. Add an
endpoint-to-Zod registry check and restrict raw transport imports so a new caller
cannot bypass schemas. Reject catch-all `z.any()`/`z.unknown()` success contracts
and empty permissive models used as a substitute for known structures.
Add naming checks using resolved Pydantic model fields and TypeScript AST/schema
shapes, including nested models. Permit documented wire aliases and dynamic map
keys, but fail new camelCase Python attributes or snake_case Zod DTO declarations.

Preserve the repository test naming and Arrange–Act–Assert sections. LaLiga tests
use `httpx.MockTransport`, exercise JWT/reauth failures and path/header forwarding,
and never make live mutations. Add focused frontend behavior tests showing malformed
responses produce an error state and do not change tokens or optimistic data.

For future API/schema changes, run from the repository root:

```bash
uv run poe lint
uv run poe test
uv run poe generate-openapi
uv run poe generate-auth-openapi
uv run poe generate-scraping-openapi
uv run poe generate-endpoint-schemas
git diff --exit-code -- backend/api/openapi.json backend/auth/openapi.json backend/scraping/openapi.json docs/api/endpoint-schemas.md
```

During development, inspect and include expected generated changes. The existing
`check-openapi-alignment.sh` fails when regenerated OpenAPI changes and checks the
endpoint-schema Markdown with the generator's read-only `--check` mode. CI and
pre-commit also run frontend tests and TypeScript builds.

From `frontend`, run `bun run lint`, `bun run build`, and `bun run test`, plus the
contract coverage check. Root tests require API/auth coverage of at least 90% and
scraping coverage of at least 80%. Commit all affected generated files; do not
hand-edit `endpoint-schemas.md`.

## Implementation verification and limits

The migration added route-level malformed-payload tests, provider and CLI MockTransport
checks, OpenAPI coverage tests, and AST checks for Python and Zod property naming.
The full API, auth, scraping, and frontend test suites plus frontend lint and build
were run. `DEBUG=false` overrides an inherited `DEBUG=release` value rejected by
local service configuration. No external services or live mutations were used.

| Validation | Result |
|---|---|
| Auth | 352 passed; 94.06% coverage (90% gate) |
| Main API | 406 passed; 92.91% coverage (90% gate) |
| Scraping | 277 passed; 88.21% coverage (80% gate) |
| Frontend | 369 passed; ESLint, TypeScript check, and production build passed |
| Python lint/format | Ruff and Black checks passed |
| OpenAPI alignment | API, auth, scraping, and generated endpoint schemas are current |

The implementation compares frontend route coverage against committed main-API
OpenAPI and validates service contracts with local mocks. The shared Python/Zod
fixture corpus checks acceptance and Pydantic wire serialization; independent auth
browser-session DTOs consume its supported response cases. This representative
corpus is not exhaustive equivalence for all optional provider extensions. A
separate machine-readable endpoint manifest is unnecessary because coverage tests
use OpenAPI. Zod
schemas cover all frontend API operations and auth responses used by the web client;
private Python-only contracts intentionally remain outside the browser bundle.
Provider-specific optional fields outside declared response models remain preserved
as JSON extensions where the repository already supports them.

## Library behavior references

Direct response objects bypass FastAPI's automatic data conversion, so their JSON
contents need explicit validation. See [FastAPI: return a response directly](https://fastapi.tiangolo.com/advanced/response-directly/).

Pydantic model validation checks declared fields and configurable extra-field
policies; using a model with unconstrained fields does not establish a complete
contract. See [Pydantic: models](https://docs.pydantic.dev/latest/concepts/models/).

Pydantic aliases can give snake_case Python attributes different validation and
serialization names. This supports preserving existing wire keys during attribute
renaming. See [Pydantic: aliases](https://docs.pydantic.dev/latest/concepts/alias/).

Zod parsing supplies runtime validation, and inference derives types from schemas.
Object schemas can reject or retain unknown keys. See [Zod: basic usage](https://zod.dev/basics)
and [Zod: defining schemas](https://zod.dev/api).

## Endpoint inventory

The tables below list every application operation from committed OpenAPI, checked
against source declarations. Paths are service-relative; the browser adds `/api`
for main-API routes. `—` means no JSON request body, not an absence of scalar input
validation. Error-body gaps apply across services in addition to the success-body
contracts listed here. Auth callback has both a JSON branch and a 302 branch.

### Main API — 46 operations

| Method | Path | JSON request DTO | Current success contract |
|---|---|---|---|
| `GET` | `/me` | — | `MeResponse` |
| `GET` | `/laliga/credential-probe` | — | `LaligaCredentialProbeResponse` |
| `GET` | `/laliga/leagues-probe` | — | `LeaguesProbeResponse` |
| `GET` | `/leagues` | — | `list[FantasyLeague]` |
| `GET` | `/leagues/{league_id}/standing` | — | `list[StandingRow]` |
| `GET` | `/leagues/{league_id}/standing/{week}` | — | `list[StandingRow]` |
| `GET` | `/leagues/{league_id}/activity/{page}` | — | `list[ActivityItem]` |
| `GET` | `/leagues/{league_id}/teams` | — | `list[LeagueTeam]` |
| `GET` | `/leagues/{league_id}/teams/{team_id}` | — | `TeamDetail` |
| `GET` | `/teams/{team_id}/money` | — | `TeamMoney` |
| `GET` | `/teams/{team_id}/lineup` | — | `TeamLineup` |
| `PUT` | `/teams/{team_id}/lineup` | `LineupWrite` | `TeamLineup` |
| `GET` | `/teams/{team_id}/lineup/week/{week}` | — | `TeamLineup` |
| `GET` | `/calendar/current` | — | `CurrentWeek` |
| `GET` | `/calendar/weeks/{week}` | — | `list[Fixture]` |
| `GET` | `/calendar/weeks/{week}/stats` | — | `list[MatchStats]` |
| `GET` | `/players` | — | `list[CatalogPlayer]` |
| `GET` | `/players/{player_id}/market-value` | — | `list[PlayerMarketValue]` |
| `GET` | `/players/{player_id}/league/{league_id}` | — | `LeaguePlayer` |
| `GET` | `/players/{player_id}/stats` | — | `PlayerStatsIndex` |
| `GET` | `/players/{player_id}/stats/detail` | — | `PlayerDetailResponse` |
| `GET` | `/players/{player_id}/stats/fixtures` | — | `PlayerFixtureStatsResponse` |
| `GET` | `/players/{player_id}/stats/market` | — | `PlayerMarketResponse` |
| `GET` | `/players/{player_id}/stats/matches/recent` | — | `RecentMatchesResponse` |
| `GET` | `/players/{player_id}/stats/matches/upcoming` | — | `UpcomingMatchesResponse` |
| `GET` | `/players/{player_id}/stats/profile` | — | `PlayerProfileResponse` |
| `GET` | `/market/leagues/{league_id}` | — | `MarketSnapshot` |
| `GET` | `/market/leagues/{league_id}/history` | — | `list[MarketHistoryEntry]` |
| `GET` | `/market/leagues/{league_id}/player-teams/{player_team_id}/offers` | — | `PlayerTeamOffers` |
| `POST` | `/market/leagues/{league_id}/{market_id}/bids` | `BidWrite` | `MarketMutationResult` |
| `PUT` | `/market/leagues/{league_id}/{market_id}/bids/{bid_id}` | `BidWrite` | `MarketMutationResult` |
| `DELETE` | `/market/leagues/{league_id}/{market_id}/bids/{bid_id}` | — | `MarketMutationResult` |
| `POST` | `/market/leagues/{league_id}/listings` | `ListingWrite` | `MarketMutationResult` |
| `POST` | `/market/leagues/{league_id}/immediate-sales` | `ImmediateSaleWrite` | `MarketMutationResult` |
| `DELETE` | `/market/leagues/{league_id}/{market_id}` | — | `MarketMutationResult` |
| `POST` | `/market/leagues/{league_id}/{market_id}/offers/{offer_id}/accept` | `AcceptOfferWrite` | `MarketMutationResult` |
| `POST` | `/market/leagues/{league_id}/{market_id}/offers/{offer_id}/reject` | — | `MarketMutationResult` |
| `POST` | `/market/leagues/{league_id}/direct-offers` | `DirectOfferWrite` | `MarketMutationResult` |
| `DELETE` | `/market/leagues/{league_id}/{market_id}/offers/{offer_id}` | — | `MarketMutationResult` |
| `GET` | `/buyout/leagues/{league_id}/player-teams/{player_team_id}/shield` | — | `ShieldStatus` |
| `POST` | `/buyout/leagues/{league_id}/player-teams/{player_team_id}/pay` | `PayBuyoutWrite` | `BuyoutMutationResult` |
| `POST` | `/buyout/leagues/{league_id}/player-teams/{player_team_id}/increase` | `IncreaseBuyoutWrite` | `BuyoutMutationResult` |
| `PUT` | `/buyout/leagues/{league_id}/shield` | `ShieldWrite` | `BuyoutMutationResult` |
| `GET` | `/health/live` | — | `HealthResponse` |
| `GET` | `/health` | — | `HealthResponse` |
| `GET` | `/health/ready` | — | `HealthResponse` |

### Auth — 16 operations

| Method | Path | JSON request DTO | Current success contract |
|---|---|---|---|
| `GET` | `/auth/login` | — | 302 redirect; no JSON success body |
| `GET` | `/auth/callback` | — | `SessionViewResponse` / 302 redirect |
| `POST` | `/auth/logout` | — | `OkResponse` |
| `GET` | `/auth/me` | — | `SessionViewResponse` |
| `POST` | `/auth/token` | — | `InternalTokenResponse` |
| `GET` | `/.well-known/jwks.json` | — | `JwksResponse` |
| `GET` | `/internal/laliga/bearer` | — | `LaligaBearerResponse` |
| `POST` | `/laliga/pairings` | — | `PairingCreateResponse` |
| `GET` | `/laliga/login` | — | 302 redirect; no JSON success body |
| `POST` | `/laliga/pairings/complete-redirect` | `CompleteRedirectRequest` | `CompleteRedirectResponse` |
| `POST` | `/laliga/pairings/{pairing_id}/complete` | `PairingCompleteRequest` | `PairingCompleteResponse` |
| `GET` | `/laliga/connection` | — | `ConnectionStatusResponse` |
| `DELETE` | `/laliga/connection` | — | `OkResponse` |
| `GET` | `/health/live` | — | `HealthResponse` |
| `GET` | `/health` | — | `HealthResponse` |
| `GET` | `/health/ready` | — | `HealthReadyResponse` / `HealthNotReadyResponse` (503) |

### Scraping — 10 operations

| Method | Path | JSON request DTO | Current success contract |
|---|---|---|---|
| `GET` | `/internal/scrape/linked-data` | — | `LinkedDataSummary` |
| `POST` | `/internal/scrape/linked-data/refresh` | — | `LinkedDataSummary` |
| `GET` | `/internal/scrape/routes` | — | `PlayerRoute` |
| `POST` | `/internal/scrape/players` | `ScrapePlayersRequest` | `ScrapePlayersResponse` |
| `POST` | `/internal/scrape/cache/invalidate` | `InvalidateRequest` | `InvalidateResponse` |
| `POST` | `/internal/scrape/probe` | `ProbeRequest` | `ProbeResponse` |
| `GET` | `/internal/players/futbolfantasy` | — | `FutbolFantasyPlayer` |
| `GET` | `/internal/health` | — | `HealthDetail` |
| `GET` | `/health/ready` | — | `HealthResponse` |
| `GET` | `/health/live` | — | `HealthResponse` |
