# Lineup builder

`POST /lineup-builder/leagues/{league_id}/build` is an authenticated, read-only
application operation. The browser uses `/api/lineup-builder/...`. It authorizes
membership through the caller's `GET /leagues`; a caller cannot choose another
manager's team. All Fantasy, scraper and football reads reuse existing services.
No bid, offer acceptance, sale, clause, shield or lineup save is executed.

## Live build progress

The browser uses `POST /lineup-builder/leagues/{league_id}/build/stream` with
the same preferences and Bearer JWT. The original `/build` JSON endpoint remains
available to the existing CLI and authenticated browser-session analysis.
Both routes verify league membership through the caller's existing services.

The stream returns `application/x-ndjson`: one JSON event per line. A `progress`
event contains `progress.stage`, `percent`, `completed_players`, and `total_players`.
The terminal event is either `{"type":"result","result":<BuildResponse>}` or
`{"type":"error","status":503,"error":"standings_unavailable","diagnostics":[]}`.
Errors after the HTTP 200 headers use the event's logical status; clients must
read the terminal event and reject truncated streams. JWT/body validation errors
before streaming retain normal HTTP errors. Exception messages and raw upstream
bodies are never included in stream errors.

Progress is a stage-weighted work estimate, not a time estimate:

| Stage | Overall progress | Measurement |
|---|---|---|
| Source loading | 0–15% | Membership, roster, cash, calendar and source snapshots |
| Player evaluation | 15–80% | `15 + floor(65 × completed_players / total_players)` |
| Trade checks | 80–85% | Verify available sale routes, when enabled |
| Lineup search | 85–95% | Bounded combinatorial search; total work is unknown |
| Optional explanations | 95–100% | Completed results sent for optional prose |
| Complete | 100% | Valid recommendations are ready |

Excluded players count as completed evaluations. Player counts are exact; the
stage weights are fixed estimates. Search and explanations advance on stage
completion rather than an artificial timer. Without explanations the build
advances directly from search to completion. Updates can be coalesced for slow
clients, so intermediate percentages are not guaranteed to be delivered.

`useLineupBuilder` exposes `progress` state and passes its percentage to the Base
UI progress component. It clears progress on a new build, failure or cancellation
and ignores updates from cancelled requests. Loading text names the current
stage and shows the reported percentage.
Closing the dialog or cancelling aborts the request, cancels upstream source work,
and signals the search thread to stop. Progress exists only for the request;
there is no retained job, polling endpoint, token storage or cross-worker lookup.
The response disables proxy buffering with `X-Accel-Buffering: no`; the frontend
proxy allows 130 seconds between reads to cover the 120-second build deadline.

In the frontend preview, players outside the current caller's squad have red
photo backgrounds and hover/focus help explaining that acquisition is required. Their Acquire
button opens current market or opponent-roster reads and the existing manual
confirmation dialogs: free-market bids, direct offers to opponent squad entries,
or release-clause payment when funds, protection, league settings, squad space
and the acquisition deadline allow it. No transaction runs during generation or
when opening options. A submitted acquisition or uncertain mutation response
marks the recommendation stale and requires a rebuild before draft use.
The expandable trade projection groups final balances, settlement deadlines,
retained squad members and trading-only purchases. Ordered transaction cards
show player names/photos, readable acquisition methods, estimates, balances
after settlement and the conditions attached to each step.

The [implementation plan](../lineup-builder-implementation-plan.md) and
[research record](../lineup-builder-research.md) explain the workflow and policies.
Generated request/response models are in [endpoint schemas](endpoint-schemas.md).

## Request and result

```json
{
  "sources": ["owned", "market", "opponents"],
  "mandatory_player_ids": [],
  "formations": [],
  "allow_buying": true,
  "allow_selling": false,
  "include_trading_purchases": false,
  "max_candidates": 5,
  "explanation": {"enabled": false}
}
```

API defaults use owned players, all verified supported formations, no trades, five
results and no explanation. The browser requests up to seven results total. The
filters **Only current squad** and **Squad with external players** narrow this
same list, preserving the original ranks without rebuilding or adding results.
Unknown keys, duplicate choices and invalid bounds
are rejected with 422 before reads. Master IDs are mandatory XI constraints;
current squad-entry IDs are returned separately. Premium formations require the
league's explicit formations entitlement. The result contains first-kickoff
context, exact Decimal scores, attainable bounds, redistributed weights,
omissions, whole-squad balances, conditional transaction steps and source exclusions.
Decimal scores are JSON strings; frontend contracts convert them to display numbers.

The bounded search alternates owned, market-containing and opponent-containing
queues. Source-specific bounds require a starter from that acquisition source,
without requiring the user to mark a market player mandatory. Default five-result
API builds reserve two external comparison slots when feasible. All selected acquisition
sources compete together for these slots using lineup score, projected cash,
forwards and final seeded ties. There is no per-source output quota: two stronger
opponent proposals outrank a weaker market proposal, and vice versa. Overlapping
lineups are deduplicated. Eligibility, finances and
deadlines still apply, and incomplete search remains explicitly labeled.

When a feasible owned XI exists, external proposals must strictly exceed its best
lineup-score sum. Equal or lower scores are omitted regardless of trading score,
cash savings or acquisition source. This compares against the best owned lineup,
not a weaker alternative. If no owned XI can fill the selected formation and
mandatory players, feasible acquisitions can still complete a lineup. Under an
incomplete search, this comparison uses the strongest owned XI found so far.
Seven total results is a cap; the browser does not fill empty external slots with
non-improving acquisition proposals.

Each acquisition source also has a comparison queue that fixes one player from
that source (plus every mandatory player) and fills remaining positions from
the owned pool. These queues share the same state/time budget with unrestricted
multi-purchase queues. This finds affordable additions even when higher-scoring,
unaffordable purchase combinations dominate the unrestricted bounds. Partial
selections are pruned when even all verified, eligible bench sales cannot cover
their purchase costs or squad slots. The cash bound also reserves the cheapest
possible completion of every remaining position: retaining a salable owned starter
removes their potential proceeds from the available budget. Score bounds account
for remaining acquisition slots, including pending bid reservations, so they do
not assume an unaffordable or oversized all-external XI.

Multiple purchases and sales share one whole-squad budget. Their combined costs
must be covered by current available cash plus verified eligible sales, with a
nonnegative final projected balance. A sale cannot fund more than one purchase
independently or include a retained starter. Sale recommendations remain ranked
by trading score; transaction steps follow actual settlement times before proceeds
are spent. Existing buying/selling permissions and required offers still apply.
Completed plans pass every financial and settlement check, and interrupted
ranking remains labeled incomplete.

The six scoring sections follow the versioned workflow. Probability, squad role
and impact-substitute bonus share enumerated achievable bounds. Minutes and rest
bonuses are mutually exclusive. Known zero remains applicable; absent facts do
not contribute points or bounds. Club form and player appearances use the last
five completed LaLiga club fixtures. Other competitions affect midweek context.
Market growth uses exact endpoint values over five elapsed days (six daily
samples); the existing stats route's `delta_rel` is percentage-valued and is not
mistaken for a decimal ratio. Rest uses Decimal half-up rounding.

### Scoring revision `2026-10-15.1`

The updated operational criteria change Fantasy averages, DAZN averages, and
the highest starting-probability band. The author clarified that the overlapping
"below 2" Fantasy-average row means below 1.5. Shared endpoints retain the
repository's convention: an exact lower boundary belongs to the higher band,
except 7.5/10 Fantasy and 2.5 DAZN, whose upper bands explicitly require "above".

| Fantasy average | Lineup rule points |
|---|---:|
| Below 1.5 | -5 |
| 1.5 to below 2.5 | -2 |
| 2.5 to below 3 | -1 |
| 3 to below 4 | 0 |
| 4 to below 5 | +1 |
| 5 through 7.5 | +2 |
| Above 7.5 through 10 | +3 |
| Above 10 | +4 |

| Played-match DAZN average | Lineup rule points |
|---|---:|
| Below 0.5 | -2 |
| 0.5 to below 1 | -1 |
| 1 to below 1.5 | 0 |
| 1.5 to below 2 | +1 |
| 2 through 2.5 | +2 |
| Above 2.5 | +3 |

Starting probability 91–100% now awards +4. Other probability bands, roles,
and the Impact Substitute bonus are unchanged. Normalization uses updated
attainable bounds: Fantasy averages [-5,+4], DAZN averages [-2,+3], standalone
probability [-5,+4], and joint role/probability/impact bonus [-8,+8]. Section
weights, trading rules, eligibility and financial checks remain unchanged.
The browser reads revised scores and rule evidence directly from the response.

Best-first search considers the whole positional pool, mandatory players first,
with an admissible score bound. Owned and external queues take turns using the
shared search budget; equal-bound nodes prefer more complete lineups. Results
reserve up to half of `max_candidates` for feasible external XIs and the remaining
slots for owned XIs. Unused slots go to the other group, and the total limit is
preserved. The API's default five-result limit permits three owned and two
improving external proposals. The browser's seven-result request normally permits
four owned and three improving external proposals, with seven total before filtering.
A limit of one preserves owned-first priority. It returns
owned XIs before external XIs, with each group ordered by lineup-score sum,
projected cash, forwards, and seeded final ties. Trading scores rank purchase
recommendations and sales. Purchase steps follow settlement times, with trading
scores breaking ties; clause purchases can wait for required sales to settle.
Extras are evaluated as descending trading-score
prefix variants, including a base plan without extras. Every retained bench
player remains valued and counted. Search stops after 100,000 states or three
seconds; `search_complete=false` identifies unproven ranking/infeasibility.
Two builds per worker and a 120-second source deadline bound server work.

## Source gates

The upstream API does not publish a complete authoritative transaction contract.
This implementation deliberately limits recommendations to established facts:

- Cash and a full market listing snapshot must be present. Pending bids are
  deduplicated by bid ID from listing-level `bid` and optional supplemental
  `userBids`; missing `userBids` alone is a supported listing-only response.
  Missing or conflicting bid amounts fail with a specific diagnostic.
  `teamInvestment` remains optional with no assumed reservation semantics.
  With bids, projected cash uses the conservative lower bound `reported cash -
  sum(distinct bid amounts)`. This can understate usable cash if Fantasy already
  reserves those amounts; the result labels it explicitly rather than claiming
  an exact balance. Each distinct bid reserves a possible squad slot, and the
  planner cannot exceed 24 including those slots. Existing bids are never
  cancelled/released or proposed again as new acquisitions.
- Every current roster identity and valuation must be present. Sparse master
  cards from any selected source fill missing club, position and market-value
  fields from the verified public player catalog by master ID; existing values, ownership and
  squad-entry IDs are preserved. Unknown catalog IDs never receive invented
  values. Loaned-player
  rosters are unavailable until their counting/ownership semantics are verified.
- Market acquisition requires a verified free-player listing with an actual
  future expiry before kickoff and no seller-owned squad entry. The authenticated
  response supplied on 2026-10-15 identifies league auctions as `marketPlayerLeague`
  and seller listings as `marketPlayerTeam`; the older captured `market_player`
  auction discriminator remains supported. Unknown or missing types are excluded.
  `directOffer`
  alone does not classify a free listing as a seller offer; the market UI uses
  that flag only together with opponent ownership. Listings with seller/owner
  metadata still require acceptance and are excluded from verified auction plans.
- Opponent clauses require enabled league buyouts, an explicit unshielded state,
  a verified lock expiry no later than kickoff minus 48 hours, and clause metadata.
  If the roster omits shield state, reuse the existing authenticated read-only
  `check-shield` endpoint. Active, missing or failed shield evidence remains excluded.
  An active shield without an authoritative expiry excludes that route.
- A sale requires an existing pending, unexpired offer at least equal to current
  market value. Its acceptance is a manual condition; projected proceeds remain
  a market-value estimate. Listing expiry and half-value immediate sale are not
  substituted for that offer. Rejected starters can still supply verified trading
  scores and remain in the current squad until a proposed sale settles.
- Missing/filled/short five-day market history, uncertain availability, ambiguous
  target club fixtures or no recent played LaLiga slot exclude the player.
  When the FútbolFantasy widget is absent, explicit Fantasy catalog statuses
  (`ok`, `doubtful`, `injured`, `suspended`) supply availability with source
  provenance; missing status never defaults to available, and active injury
  evidence still excludes a contradictory `ok` status.
  An available-for-round date derived from the player's fixture is not a medical
  recovery timestamp. Unavailable players with only that prediction are excluded.
- Injury-history bands require complete parsed coverage; missing or dropped
  history does not earn a no-injury bonus. The scraper reports coverage and counts.
- Starting probability must describe the target round. Missing risk is omitted.
  Numeric-only form is omitted; all five published arrow categories are supported.
- Unknown first kickoffs and inconsistent current-round opening metadata fail
  closed. Original Fantasy round IDs survive postponements. Advanced/split-round
  conflicts require verified source handling rather than a guessed deadline.

These restrictions are visible in diagnostics. Market diagnostics distinguish
unsupported listing type, seller acceptance,
missing/naive expiry, an expired listing and settlement at/after kickoff. Opponent
diagnostics distinguish league settings, protection expiry, active/unknown shield
state, and missing clause prices. The conservative pending-bid reserve is an
informational cash bound and is not counted as a player/source exclusion.
The frontend exclusions table shows only unavailable players and verified clause
locks that expire after the target matchday's first kickoff. A lock expiring
exactly at kickoff is free at that instant and is not included in this table.
The separate 48-hour eligibility buffer and other source diagnostics remain in
the build response; they are not displayed as matchday availability exclusions.

Further authenticated read-only
captures are needed for exact gross/net reservation accounting and timed shield expiries;
no production transactions are needed to collect that evidence.

## Errors

401 covers authentication/pairing, 404 caller-scoped membership, 409 proven
infeasibility/mandatory or formation conflicts, 429 worker capacity, 502 malformed
source payloads, and 503 required source/deadline/search interruption. Existing
sanitized provider statuses are retained. Build conflicts include bounded source
and player diagnostic codes. Partial optional source failures do not erase usable
criteria. Interrupted search without a candidate never claims infeasibility.

Club standings and their recent match histories are required to verify player
appearances before the current round starts. A standings outage or inconsistent
classification returns 503
`standings_unavailable` before per-player evaluation, rather than discarding the
whole pool and reporting 409 `no_feasible_lineup` or `mandatory_player_conflict`.
The browser prioritizes source-wide diagnostics ahead of player exclusions in
its bounded error summary.

Once the current Fantasy round has started (live metadata or a reached kickoff),
recent-match analysis uses the last five finished club matches from earlier
original round numbers. For example, while round 9 is running, it reads round 8
and earlier; even finished games from round 9 stay outside this history. The
build target remains the next unstarted round. Earlier postponed games count
only after finishing, ordered by actual kickoff. Calendar results require verified
dates, club identities and scores; missing player appearances are never invented.
If the official classification is temporarily inconsistent during play, these
verified histories still permit a build. Club/opponent position criteria are
omitted, with `standings_unavailable` recorded. `recent_matches_previous_round`
labels this history policy in the response and preview. Club form evidence
identifies `fantasy_calendar` as its source.

## CLI and browser

```bash
cd backend/api
uv run fantasy-lineup-builder --league-id 123 --preferences-file preferences.json --json

cd ../auth
uv run fantasy-browser-session lineup-builder-analysis --league-id 123 --preferences-file preferences.json --json
```

Preference files are validated before login. Auth maintains an independent contract
and calls only the application planning POST; it never imports API or scraping code.
Both helper CLIs allow 130 seconds per build request to cover the server's 120-second deadline.

The dialog gates chooser reads by selected source, cancels work on close or scope
unmount, retains a prior result as stale on refresh failure, and shows rule/trade
traces. Expired pairing discovered through HTTP or stream errors opens the existing
LaLiga reconnect flow. Draft replacement confirmation belongs to the selected build
and target round; starting another build discards it, including when that build is cancelled.
Use as draft checks current roster identities, supported formation and
editable target week. Replacing an unsaved draft requires explicit confirmation.
Saving remains the existing separate action.

During a live round, applying an owned recommendation opens the next unstarted
round and stores the draft under that round's identity. The currently displayed
round need not match beforehand. Live metadata, the opening time and current
fixture states determine the planning round. Ownership, supported formation and
caller-team checks still apply. Replacement confirmation checks the target
round's unsaved draft, including when another round is currently displayed.

Market/opponent source selection also requires **Allow purchase recommendations**.
This permission enables conditional proposals only; it executes no purchases.
External proposals remain visible even when current ownership prevents draft use.
Draft use is enabled only after every starter is present in the refreshed owned
squad and the target round is editable. Unknown acquisition routes, protected
opponents, insufficient source data or infeasible finances still exclude proposals.

## Optional explanation

Set `LINEUP_EXPLANATIONS_ENABLED=true`, `LINEUP_EXPLANATION_MODEL`, and
`OPENAI_API_KEY` on the API server to enable the optional Responses adapter.
`LINEUP_EXPLANATION_EFFORTS` is a JSON mapping of configured model to verified
supported efforts, e.g. `{"configured-model":["low"]}`. Without an allowlisted
effort the adapter omits the reasoning parameter. The request cannot select a model.
No live paid request is part of automated validation.

The provider receives sanitized completed scores and existing API news, has no
transaction tools, uses strict structured output, and validates candidate/evidence
references. Failure/refusal/timeout returns unavailable prose without changing
candidates. News never contributes deterministic points. The implementation follows
[Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
and [model-specific effort guidance](https://developers.openai.com/api/docs/guides/reasoning).
