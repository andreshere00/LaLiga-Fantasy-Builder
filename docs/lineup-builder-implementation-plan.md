# Automatic lineup builder implementation plan

**Status:** Implemented read-only builder with conservative source gates, validated with mocked integration and browser tests.
See [implementation guide](api/lineup-builder.md) for exact supported source contracts and remaining live-data gates.
**Prepared, researched and implemented:** 2026-10-14.
**Scoring criteria revised:** 2026-10-15 (`2026-10-15.1`).

## 1. Objective and source of truth

Introduce an authenticated, read-only builder that returns feasible starting XIs,
trading plans, score explanations, and optional LLM commentary for the next
matchday that has not started. Connect it to the existing **Build lineup** dialog.

The operational specification is
`/Users/aherencia/Documents/Obsidian Vault/Professional/LaLiga Fantasy Builder/Operational Workflow for the Automatic Lineup Builder.md`.
The source inspected for the scoring revision has SHA-256
`b8e8992551c48b609b8fd055db0f830e9e51f0dd5112ef67a9deba0bc3431409`.
Re-read it before implementation and reconcile changes if the hash differs.
The author clarified the overlapping Fantasy-average rows on 2026-10-15:
the -5 band applies below 1.5, and -2 applies from 1.5 up to 2.5.
Its ten sections govern behavior. The researched scoring/football defaults below
are adopted **builder policies**, distinct from published game rules; proposed
API shapes and module names remain implementation design choices. Evidence,
citations and narrowly defined remaining checks live in the
[research record](lineup-builder-research.md).

Follow [AGENTS.md](../AGENTS.md), [Architecture](architecture.md),
[Adding endpoints](api/adding-endpoints.md),
[Proxy endpoint pitfalls](api/proxy-endpoint-pitfalls.md), and
[Developing authenticated endpoints](authentication/developing-authenticated-endpoints.md).
Use Python 3.14, typed public APIs, Google docstrings, Pydantic, black, ruff,
and the repository's test naming and section conventions.

The builder produces recommendations. It does not place bids, sell players,
pay or increase clauses, activate shields, or save a lineup. A user may later
apply an owned-player candidate to the local draft and use the existing save flow.
An external-player candidate remains a preview until acquisitions succeed and
the refreshed caller roster supplies its new squad-entry identifiers.

## 2. Repository baseline

| Existing component | Reuse and necessary change |
|---|---|
| `frontend/src/features/lineup/LineupBuilderDialog.tsx` | Already collects source choices, chosen players, formations, and selling permission. It currently closes without submitting a build. Replace presentation-only state with validated preferences and a build action. |
| `LineupPage.tsx`, `useLineupBoard.ts`, `lineupDraft.ts` | Existing pitch, drafts, roster lookup, and full-replace save flow. Add explicit candidate-to-draft integration after ownership and target-week checks. |
| `frontend/src/features/lineup/formations.ts`, `assets/lineups_available.json` | Seven free and five premium formation codes. Share/test the supported catalog with the backend; respect verified league entitlement. The current builder UI filters premium formations. |
| `api/leagues.py`, `services/leagues.py`, `schemas/leagues.py` | Caller leagues/team, league configuration, rosters, master IDs, squad-entry IDs, clauses and protection metadata. |
| `api/teams.py`, `schemas/teams.py` | Current lineup and money. `TeamMoney` exposes optional `team_money` and `team_investment`; neither establishes borrowing-capacity semantics. |
| `services/player_stats.py`, `schemas/player_stats.py` | Aggregate profile, market history, recent/upcoming matches, fixture statistics, weather, news, and per-source diagnostics. Reuse internally rather than call the API over HTTP. |
| `domain/market_window.py` | Existing five-day market window, relative changes, gap filling, and provenance. Validate endpoint coverage before using a filled or shortened window for builder scoring. |
| `services/standings.py`, `services/fixture_standings.py` | Real club positions and last-five league results. Use completed mode; Fantasy manager rankings are a separate dataset. |
| `services/calendar.py`, `schemas/calendar.py` | Current matchweek and dated fixtures. The builder must resolve the next unstarted week independently of the week currently displayed in the UI. |
| `services/laliga.py`, repositories, shared HTTP clients | Existing credential exchange, encoded paths, retries and sanitized failures. Preserve public reads without an upstream bearer. |
| `frontend/src/api/client.ts`, `schemas.ts` | Authenticated abortable POST, Zod contracts, endpoint registration and wire serialization. Extend these instead of introducing another client. |
| API CLI contracts and auth browser-session flows | Extend both for a read-only planning POST; their existing GET analysis helpers are insufficient for the new request. |

Important findings from the current code:

- Player profile injury history defaults to `[]`; there is no coverage marker
  proving that an empty list represents a complete 30-day history.
- Season participation is available inside scraped season data, but the public
  profile response exposes averages without the season Fantasy total and
  played-match denominator needed to verify the workflow's average.
- Availability is exposed through injury fields, Fantasy status and explanatory
  text. Add a verified structured interpretation for builder eligibility;
  do not infer availability from an absent injury block.
- Recovery currently includes a date derived from “available for matchday” text.
  A date alone does not establish an exact recovery instant before first kickoff.
- `PlayerStatsService.detail()` may return 200 with `segment_errors`.
  Successful HTTP transport is insufficient to declare a player scoreable.
- Starting probability has a matchweek, and form may be numeric or a categorical
  arrow with `visual_only=true`. Their interpretation needs explicit policies.
- Existing UI market affordability helpers have action-specific behavior and
  are not an authoritative implementation of the builder's sequence constraints.
- No automatic-builder scoring policy or complete numeric boundary table was
  found in the repository. Existing official Fantasy scoring computes match
  points; it must remain separate from lineup-suitability scoring.
- Research found three specific adapter changes: support the fifth published
  form category, preserve complete empty injury history without truthiness
  coercion, and retain parsed official season-point aggregates and missing-field
  provenance through `services/wire_map.py`.
- The private `PlayerDocumentService` already retrieves and merges competition
  companion pages. Reuse their fixtures/minutes for midweek context; no new
  football provider is required for this criterion.

## 3. Implementation decisions and gates

### Settled design

1. **Own the feature in `backend/api`.** Use controller → application service →
   data repository/adapters → existing domain services/repositories/clients.
   The pure scoring and planning engine contains no HTTP or credentials.
2. **Build from a server snapshot.** The browser sends preferences and master
   player IDs. It cannot supply trusted scores, cash, values, ownership,
   borrowing capacity, injury dates, or target kickoff.
3. **Resolve the caller team from the selected league.** Derive identity from
   verified JWT `sub`, resolve membership using caller-scoped `GET /leagues`,
   and take that league's caller team. Never build for the opponent currently
   selected in the lineup screen, or authorize from a submitted `user_id`.
4. **Use a synchronous planning POST initially.** Add bounded source concurrency,
   cancellation and a search budget. Keep CPU search off the request event loop.
   Do not add persistence, a new service, or a queue until measured cold-build
   latency requires an authenticated job lifecycle.
5. **Separate score axes and explanations.** Lineup score selects the XI;
   trading score orders acquisitions and sales. Combined score is informational.
6. **Preserve feasibility semantics under limits.** A budget-limited search is
   incomplete. It cannot establish that no feasible lineup exists or that its
   returned candidates are globally best.

### Research resolutions and remaining data gates

The [research register](lineup-builder-research.md#1-resolution-register) settles
the numeric intervals, form mapping, matchweek-specific probability, league-form
scope, midweek selection, ordinary debt rule, transaction timing, and optional
LLM architecture. These no longer require an upfront preference decision.
The following are evidence and contract tasks during implementation; fail closed
for the affected player, route or build when a required input is unavailable.

| Gate | Resolution and fallback |
|---|---|
| Cash, investments, pending commitments, borrowing capacity | The official 20% debt rule is established. Verify whether `team_money` is already net of reservations and what `team_investment` includes using read-only snapshots with existing pending bids. An absent optional capacity field uses the published rule. Missing required cash, valuations or commitment semantics stops the build; do not place a bid to obtain evidence or reinterpret investment as a debt limit. |
| Acquisition and sale restrictions | Use published expiry-based free-player settlement, seller acceptance and pending-bid squad reservations. Expose verified league permissions, listing/offer dates and distinct lock/shield metadata. Required sales need a viable settlement route before the builder deadline; listing expiry alone is not proof of payment. An active shield with unknown expiry excludes the opponent clause route. |
| Availability and recovery | Preserve current status, matchweek forecast, date/instant precision and source as-of time. A date derived from the player's next fixture is not a medical return date. Keep suspension/absence separate from injury; unknown mandatory eligibility cannot be accepted. |
| Injury-history completeness | Preserve recognized empty versus missing source blocks, parse/drop counts and top-level `missing`/warnings. Add `complete`/`partial`/`unknown` source coverage over the relevant 30-day history. Only complete published coverage supports the no-injury bonus; it is not a medical guarantee. |
| Season average and recent match slots | Preserve existing parsed official Fantasy total and played-match denominator with season/competition/mode provenance. Do not accept `points_mode_missing` placeholder zeros. Join the last five LaLiga club fixtures to played player records without pulling older appearances into the sample. |
| Form and probability | Support all five published form categories, map them to the workflow's three classes, and omit numeric-only form. Verify the missing fifth DOM class before parsing it. Only the target matchweek's probability applies; missing risk is not explicit “Unknown.” |
| Target week, postponements and season end | Preserve original Fantasy round IDs; multiple games in a calendar week are not automatically a double Fantasy round. Verify opening metadata against first kickoff. Exceptional split-round disagreement returns `target_deadline_conflict`; no future round returns a build conflict. |
| Supported formations | Use verified free/premium entitlement. Default to all supported formations for the caller; do not silently grant premium support or ignore a supported formation. |

Do not invent upstream routes for these gaps. Consult the repository's upstream
catalog and domain READMEs before extending reads. Low-confidence and legacy-host
routes remain prohibited. A gap with no verified source remains explicitly
unavailable, with the failure behavior above.

## 4. Proposed public contract and module layout

### API

Add `POST /lineup-builder/leagues/{league_id}/build` with an internal Bearer JWT.
The frontend reaches it under `/api/lineup-builder/...`. This is an app planning
operation; all Fantasy requests made by it are reads.

**Proposed request wire shape** (snake_case, following app-owned stats contracts;
the frontend uses camelCase DTOs and an explicit serializer):

```json
{
  "sources": ["owned", "market", "opponents"],
  "mandatory_player_ids": ["4288"],
  "formations": ["4,3,3", "4,4,2"],
  "allow_buying": true,
  "allow_selling": false,
  "include_trading_purchases": false,
  "max_candidates": 5,
  "explanation": {"enabled": false}
}
```

- Strict request and nested preference models use `extra="forbid"`.
- Require at least one recognized source; master IDs must be nonempty and
  unique, with at most eleven mandatory players. Unknown and duplicate
  formations are rejected. Empty/omitted formations mean all supported ones.
- Default to owned sources, no buying, no selling, and no trading-only purchases.
  **Proposed** output bound: default five candidates, maximum twenty.
- Selecting external sources does not override buying permission. Mandatory
  players outside permitted sources produce a clear preference conflict.
- Validate formation positional capacity, master identity and entitlement on
  the server. A valid selection that cannot be fulfilled is a build conflict,
  rather than malformed JSON.
- `explanation.reasoning_effort` is optional and only valid when explanations
  are enabled and supported by the configured provider. Do not accept a free-form
  model/provider name or expose credentials.

Use typed `FlexibleModel` response models. The response contains:

| Part | Required content |
|---|---|
| Build context | Build ID, rules version, snapshot/as-of time, resolved caller team and league, target week, first kickoff and relevant deadlines. |
| Search status | Complete/incomplete, limit reason, counts of evaluated/rejected players and candidates; distinguish completeness from a deliberately limited result page. |
| Candidate identity | Candidate ID, formation, own/external resource group, seeded tie-break result. |
| Starting XI | Eleven unique master IDs, source, position, club, owned squad-entry ID where applicable, individual lineup/trading/combined scores, and total lineup score. |
| Scoring explanation | Rule IDs, observed inputs and provenance, applied points, omitted criteria/reasons, section lower/upper bounds, normalized scores and effective weights. |
| Trading plan | Required acquisitions, separate trading-only purchases sorted by trading score, required sales sorted by trading score, acquisition methods and conditions, current market-value estimates, and ordered steps. |
| Finances and squad | Current/retained/acquired/sold squad membership, resulting count and market value, cash projection, and each step's balances and debt-limit checks. |
| Deadlines and protection | Latest feasible sale and clause-acquisition times, lock/shield expiries, conditional settlement windows, and advisory protection recommendations. |
| Diagnostics and optional prose | Sanitized rejected-player reasons and missing-data warnings; LLM explanation with source references and independent availability/error status. |

Do not return opponent squad-entry IDs as caller-owned lineup write slots.
Trading-only purchases do not change the resource group of an all-owned XI.
Expose monetary amounts in integer EUR; use Decimal or exact rational arithmetic
for ratios and ranking. Round only for presentation, except the specified rest bonus.

### Errors

Preserve the common `{ "error", "detail" }` envelope. Add a builder-specific
typed error model with bounded structured diagnostics if needed, updating its
Pydantic/Zod/CLI contracts together; never rely on parsing prose for UX.

| Status | Category/behavior |
|---|---|
| 401 | Existing unauthorized or `needs_reauth`; keep credential behavior unchanged. |
| 404 | Selected league is unavailable to the verified caller. |
| 422 | Invalid body, unknown source/formation, extra keys, bad preference bounds. |
| 409 | Proven no feasible candidate, mandatory-player conflict, or no unstarted target matchday. Include the relevant sanitized reasons. |
| 502 | Malformed upstream JSON/shape or inconsistent required source data. |
| 503 | Required financial/target/restriction data unavailable, or search budget exhausted before any candidate can be established. Do not label this “no feasible lineup.” |
| 429 | Build rate/concurrency limits, with `Retry-After`. |

A successful partial search returns validated candidates with `search.complete=false`
and a visible limit reason. Individual-player data failures may coexist with a
successful build; required financial failures stop it immediately.

### Proposed files

All backend paths below are relative to `backend/api/src/fantasy_api/`:

```text
api/lineup_builder.py                 authenticated controller
schemas/lineup_builder.py             strict request and typed results/errors
services/lineup_builder.py            snapshot → engine → optional explanations
repositories/lineup_builder.py        typed read adapter over existing domains
domain/lineup_builder/models.py       immutable normalized snapshot/domain records
domain/lineup_builder/policy.py       versioned formations, bands, weights, time rules
domain/lineup_builder/target.py       matchday/deadline resolution
domain/lineup_builder/eligibility.py  explicit inclusion/exclusion decisions
domain/lineup_builder/scoring.py      raw scores and per-rule explanations
domain/lineup_builder/normalization.py conditional attainable bounds and aggregation
domain/lineup_builder/planning.py     position search, trading plans, feasibility
domain/lineup_builder/ranking.py      group ordering and seeded final ties
cli/lineup_builder.py                read-only planning command
```

Keep this domain package cohesive; split further only when implementation size
requires it. The adapter composes existing services without API loopback or new
generic proxy classes. Wire it in `api/deps.py`, register the router in `main.py`,
and add OpenAPI tags/errors in `openapi.py`. Acquire/reuse credentials through
existing helpers within the logical build; do not construct per-player clients.
Any optimization of credential reuse must retain the existing single auth refresh
on upstream 401 and avoid sharing user credentials between requests.

## 5. Data collection and snapshot policy

1. Verify JWT and caller membership before fetching team financials or opponent
   rosters. Resolve the caller's actual team even when the UI displays a rival.
2. Capture an injected UTC clock once for reproducible temporal decisions.
   Use timezone-aware instants for deadline comparisons, and the existing
   market-history date policy for daily values. Display Madrid/local offsets.
3. Resolve target week, validate required finance inputs, and load the complete
   owned roster. Every retained bench player contributes to value/count even
   if it cannot start or lacks sufficient scoring data.
4. Load only selected external sources, with verified acquisition restrictions.
   Deduplicate footballers by master ID while retaining listing, owner, acquisition
   method, and squad-entry references separately. Owned listings remain owned.
5. Load the catalog, standings in completed mode, and calendar context once per
   build. Map real clubs using existing identity helpers rather than names alone.
6. Enrich eligible source players via existing stats services. Request market
   `preset=5d`, the last five LaLiga club-match slots reconciled with player fixture
   statistics, and sufficient merged competition history for the preceding midweek
   match. The recent widget can mix competitions; filtering its already-truncated
   five rows must not stand in for five LaLiga slots. Match target fixtures by
   competition/week/club; the first upcoming list entry is not necessarily target.
7. Interpret each `segment_errors` item. Missing all recent records or required
   market history excludes that player. Missing optional weather, news, or injury
   history omits only the applicable criterion. Unknown availability, identity,
   position, or acquisition permission cannot prove eligibility.
8. Attach source/as-of metadata and enforce documented maximum source age.
   Financial and ownership reads must be fresh for this build; shared public
   stats/standings may use existing documented caches. Do not reuse a prior
   recommendation as an affordability snapshot.
9. Recheck target/deadline and mutable finance/ownership inputs before returning
   a long-running build. If relevant data changed, refresh/recompute within the
   budget or return an explicit stale-context error instead of a current result.

Use bounded fan-out compatible with scraper limits and existing single-flight
caches. Repeated stats segments for one player should reuse the cached profile.
Cancel pending source calls when the request ends. Missing scraping/configuration
must not become a fabricated empty segment. Never download HTML or news directly
from the browser or from the scoring engine.

Add public fields only where their semantics are verified: season totals/counts,
availability/recovery precision, history coverage, and financial restrictions.
Preserve `missing`, official `fantasyPoints` mode/totals and explicit empty history
through `wire_map.py`; the source already supplies them. Add diagnostics for
unparsed injury-history rows before declaring completeness, and propagate the
fifth form category through parser/API/Zod models once its visual mapping is verified.
Extend the private scraping/parser schemas only if existing parsed provenance
cannot establish these values. Preserve the stats detail route's partial-200
semantics; stricter builder requirements belong in its adapter.

## 6. Target matchday and eligibility

- Choose the earliest supported matchday whose first actual scheduled match
  has not started. Use current/next hints to guide the search, then verify dates
  and states. An underway matchday targets the following unstarted one; exactly
  at first kickoff the earlier matchday is no longer eligible.
- Unknown first kickoff, conflicting started states, unresolvable postponed
  fixtures and season-end gaps must produce explicit diagnostics. Do not invent
  the next season or derive a deadline from the selected player's own kickoff.
- Retain original competition/season/round identity when dates move. A postponed
  fixture from a started round is not a new build target. Two appearances during
  one calendar week do not grant a second XI or score multiplier. If Fantasy's
  published opening boundary and first actual fixture disagree for a split round,
  return `target_deadline_conflict` until that case has verified source handling.
- Recovery must be strictly before target first kickoff. A same-day date with
  no reliable time cannot prove this; preserve its uncertainty. Available players
  qualify, questionable players qualify with -5, unavailable players without
  confirmed timely recovery are excluded.
- Opponent protection must expire at or before kickoff minus 48 hours. Separate
  temporary clause locks, shield state/expiry, and clause price. A future expiry
  may qualify only if a permitted acquisition window remains before kickoff
  minus 24 hours and other league restrictions allow it.
- The two-week acquisition/assignment lock and timed advertising shield are
  distinct. Use the later verified active expiry for protection; `isShielded=true`
  without an expiry is not a timestamp. Do not infer one from `buyoutClauseLockedEndTime`
  or from nominal 24h/48h duration. Unknown owned protection omits that criterion
  rather than removing the owned player from its roster or all scoring sections.
- Keep missing-data exclusions distinct from injury/acquisition exclusions.
  Reject a build if any mandatory player cannot qualify, or its positional
  combination cannot fit any supported requested formation.
- Reject coaches/unsupported positions from the footballer XI. Premium captain,
  coach, bench scoring, loans and multi-position assumptions are outside the
  operational scoring rules; preserve verified existing save semantics separately.

## 7. Scoring policy and normalization

Implement the workflow tables as versioned rule data/functions. Each criterion
returns applicable/omitted status, raw lineup/trading points, source inputs,
rule ID and the outcomes used to establish its attainable bounds.

| Workflow section | Implementation and conformance requirements |
|---|---|
| 5.1 Basic | Club position bands; total Fantasy points divided by played matches from the same season/competition; questionable -5. Timely injured recovery is scored once in 5.6, avoiding a second -3 here. |
| 5.2 Indicators | Injury-risk low/medium/high/explicit unknown = +1/0/-1/+1; integer probability bands; Revulsivo +2 only below 60%; six role labels and good/average/poor form. Missing indicators are omitted. |
| 5.3 Recent matches | Last five LaLiga club-match slots, played records only in the DAZN average denominator, fewer available matches allowed, no played record excludes player. Unknown DAZN is not zero; omit the criterion if no published DAZN sample survives, while preserving valid recent records. Other stats add no points. |
| 5.4 Market | Owned protection: expired (-7 trading, -3 lineup); ≥48h before start (-5, -3); <48h before start (-3, 0, protect); protected through start (+3, 0). Opponent expiry controls eligibility. Exact five-day relative-change bands and expensive-low-growth trading adjustment only when growth <1%. |
| 5.5 Fixtures | Last five club results (+3/+1/0), preceding other-competition midweek match (-2), 60–90 minutes (+1) plus win (+3), eligible nonzero-minute rest bonus, target weather and opponent-position bands. Do not award a zero-minute rest bonus or independently score other match statistics. |
| 5.6 Injury | One days-since-most-recent-injury band relative to target first kickoff; timely current-injury recovery -3 replaces history scoring. Complete no-injury 30-day history +3; unknown history omitted. No trading points. |
| News | Zero deterministic points; optional explanatory evidence only. |

### Adopted scoring boundaries and football scope

Implement these resolved defaults in `policy.py`, the feature README and
table-driven tests. They are builder policies, not official suitability-scoring
standards. The [research record](lineup-builder-research.md) gives evidence and
separates published football/game rules from implementation choices.

- Fantasy averages: `<1.5 → -5`, `[1.5,2.5) → -2`, `[2.5,3) → -1`,
  `[3,4) → 0`, `[4,5) → +1`, `[5,7.5] → +2`, `(7.5,10] → +3`, `>10 → +4`.
- DAZN averages: `<0.5 → -2`, `[0.5,1) → -1`, `[1,1.5) → 0`,
  `[1.5,2) → +1`, `[2,2.5] → +2`, `>2.5 → +3`.
- Starting probability 91–100% awards +4; other probability and role bands are
  unchanged. Standalone probability bounds are [-5,+4], and the combined
  role/probability/impact-substitute family has achievable bounds [-8,+8].
  Fantasy-average bounds are [-5,+4]; DAZN-average bounds are [-2,+3].
- Expensive-player values in millions: `[0,10) → 0`, `[10,15) → -1`,
  `[15,25) → -2`, `[25,50) → -3`, `[50,80) → -4`, `[80,120) → -5`,
  `[120,180] → -8`, `>180 → -10`. Growth exactly +1% gets no additional
  expensive-player penalty; its base trading band remains the specified -1.
- Use Decimal `ROUND_HALF_UP` for the nonnegative rest bonus, consistent with
  existing parser rounding practice. For example, `1 × 0.50` awards one point.
  Keep strictly `<60%` for Revulsivo's extra bonus.
- Map published form `bad/very_bad → poor`, `mid → average`, `good/very_good → good`.
  `visual_only` means no numeric average, not absence of a published category.
  Numeric-only form has no defined thresholds in the workflow or repo; omit it
  with a diagnostic until a verified categorical mapping exists.
- Use only a starting-probability prediction relevant to the target week; omit a
  stale/mismatched prediction. Rest bonus is omitted when its probability is absent.
- **Midweek policy:** identify the latest competitive non-LaLiga club fixture
  between its preceding completed LaLiga fixture and target first kickoff.
  Include cup/Supercopa/European club competitions, exclude friendlies and
  national-team matches, and require known competition/date identity. Use actual
  scheduling rather than a Tuesday-to-Thursday-only filter; UEFA schedules allow
  exceptions. No extra fatigue points are introduced for other matches.
  If a future such fixture exists but is not yet played, apply its known congestion
  criterion and omit unknown minutes/result/rest criteria.
- Team recent results use completed LaLiga results from standings, ordered by
  actual kickoff. This keeps league form comparable; cup/European fixtures remain
  midweek context and do not change this five-match result sample. If a target
  week has multiple fixtures for the club and no repository rule selects one,
  fail that player's target-fixture context explicitly instead of silently
  averaging opponents or weather.

### Bounds and aggregation

1. Sum raw lineup and trading points separately inside each of the six sections.
2. Calculate section lower/upper bounds from achievable criterion combinations
   under applicable conditions, including mutually exclusive availability,
   protection, minutes/rest and injury branches. Do not add independent extrema
   that cannot occur together. Keep probability/Revulsivo dependencies coherent.
3. Missing/inapplicable criteria contribute neither points nor bounds. Known-zero
   criteria remain applicable; a present all-zero section remains present.
4. For a positive sum divide by the positive attainable upper bound; for a
   negative sum divide by the absolute negative lower bound; preserve zero and
   clip to [-1,+1]. A section with no possible nonzero score contributes zero.
5. Combine nonempty lineup sections using weights
   `0.25, 0.25, 0.10, 0.10, 0.25, 0.05`, divided by their remaining weight sum.
   Missing midweek data affects only its fixture criteria, not the whole section.
6. Trading score is the sum of normalized applicable trading sections without
   lineup weights. Combined score is lineup plus trading score.
7. Retain exact internal values for ranking. Display rounding must not create
   false ties. Inject a seeded RNG solely for the final otherwise-equal tie.

Test bounds independently from the scoring evaluator using enumerated valid
outcomes for dependent rule families. Adding an unrelated candidate must not
change any existing player's scores or normalization bounds.

## 8. Candidate search and trading feasibility

### Formation search

For each supported selected formation, include mandatory players first and
fill exactly one goalkeeper plus the positional counts with unique eligible
footballers. Rank each position by lineup score. Search all-owned starting pools
and permitted external pools separately so the priority group cannot disappear.

Use best-first/branch-and-bound exploration with admissible lineup-score upper
bounds. Branch into lower-score/cheaper alternatives when the strongest XI fails
budget, positional, sale or deadline constraints. Do not stop after the greedy XI
or trim each position to an arbitrary top-N pool. Only prune a dominated option
when source, eligibility, mandatory membership, trade route and finance effects
establish that it cannot produce a better feasible result.

Deduplicate the same formation, XI and material trade plan. A different plan for
the same XI may matter when optional purchases change projected cash. Prove the
returned top-K through bounds where practical; expose incomplete search when
the configured time/state budget prevents that proof. An exhausted search with
no candidates supports 409; an interrupted search with none supports 503.

### Whole-squad plan

For every candidate, start from the entire execution-time owned roster:

- Retain the bench unless a permissible sale is explicitly proposed. A rejected
  owned starter is still owned and valued. Sale proposals require a valid trading
  score, verified sale permission and timing; missing scores are not replaced by zero.
- Required acquisitions contain external starters. Trading-only purchase
  recommendations are separate, ranked by descending trading score, and permitted
  only when their preference is enabled. Generate a base plan without extras and
  feasible variants with extras; every included purchase enters all calculations.
- Sales come only from execution-time owned players outside the candidate XI.
  Consider them in ascending trading score with a stable identity tie-break and
  select enough to repair final cash and squad capacity. Never sell a mandatory
  starter or a newly proposed acquisition, and never sell when permission is off.
- If eligible sales are insufficient, search another XI/plan. An injured player
  excluded from starting may still be a sale candidate when its trading data and
  transaction permissions are established.
- Evaluate transactions in a feasible order, generally settling needed sales
  before purchases, with actual settlement windows and dependencies. Expected
  proceeds cannot finance a step before the sale settles.

Compute market-value estimates, including opponent acquisitions:

```text
candidate_value = current_value + acquired_values - sold_values
projected_cash  = current_cash + sale_proceeds - acquisition_costs
candidate_count = current_count + acquisitions - sales
```

At each proposed stage, not just the final state:

1. Ordinary acquisition capacity is verified cash plus allowed borrowing.
   Use authoritative capacity when available with its documented semantics;
   otherwise apply the verified 20% debt rule to that stage's squad valuation.
   Test affordability before acquisition so a purchase cannot finance itself
   by adding its own value to the squad; recheck the resulting state too.
2. Release-clause acquisitions and increases have no borrowing allowance.
   Protection advice is advisory; do not invent or include a clause-increase
   payment unless a separately specified protection plan is introduced.
3. Final projected cash is at least zero when the lineup is recorded.
4. Resulting squad, including trading-only purchases, is at most 24. Respect
   verified transient squad/bid reservations as acquisition restrictions too.
5. Required sales settle no later than first kickoff minus 24 hours, the builder
   requirement. Release-clause transactions finish before the official closure
   at first kickoff minus 24 hours. Evaluate exact-boundary behavior explicitly.
6. Account for current active bids/committed money once using verified semantics.
   Do not release unrelated reservations to make a plan appear affordable.

Free-player purchases resolve at the listing's actual expiry. Seller-owned
listings require acceptance, and a three-day listing lifetime does not establish
the settlement instant. Distinguish a valid existing offer from a conditional
future offer, and do not credit either before its proposed acceptance/settlement.
Active offers reserve squad capacity; recheck the cap at assignment as well as
bid submission. Do not hard-code an overnight resolution cycle.

There is no additional 120% squad-growth ceiling. Retained squad values and cash
must be available even when selling and buying are disabled.

The workflow intentionally estimates buys and sales at market value. Return those
estimates with their transaction conditions. Retain actual clause price separately
as factual acquisition metadata, never substitute it into the requested estimate.
An estimate does not prove actual clause affordability or offer acceptance.
The existing immediate-sale route pays half market value, confirmed by official
help in the [research record](lineup-builder-research.md#4-fantasy-finances-market-timing-and-protection).
It cannot be presented as the means to realize the builder's full-market-value
sale estimate. Recheck
actual price, funds, deadline and ownership before any later manual action.

Official rules checked on 2026-10-14 support the 20% debt rule and prohibition on
clause borrowing ([debt guidance](https://laligafantasy.zendesk.com/hc/es/articles/360007533594--Puedo-quedarme-con-saldo-negativo-en-mi-presupuesto)),
and lineup-time balance, cash-only clause increases, and the 24-hour clause closure
([regulations](https://laligafantasy.zendesk.com/hc/es/articles/360025679853-Reglamento)).
The workflow's 48-hour opponent eligibility buffer and 24-hour required-sale
deadline remain builder policies. Recheck official rules and verified league
restrictions at implementation; rules and fixture times can change.

### Result ordering

Always order the two groups as all-owned starters, then external starters.
Within each group compare total lineup score descending, projected cash descending,
number of forwards descending, then seeded random choice. Trading score must not
replace any of those lineup-ranking keys. Optional trading-only acquisitions do
not move an owned XI into the external group.

## 9. Frontend workflow and optional explanations

Add `useLineupBuilder.ts`, validated preference/result models and a candidate
results component under `frontend/src/features/lineup/`. Keep deterministic
decisions on the backend and derive result views during render.

1. Replace synthetic strings such as `owned:My squad:<slot>` with structured
   master/slot/source references. Label selected players **Mandatory players**;
   selecting them is a hard constraint rather than a soft preference.
2. Separate source, buying and selling controls. Explain that no formation choice
   means all supported formations. Show premium choices only when supported.
   Fetch chooser rosters/market only as needed for the selected sources, with
   cancellation and visible source-specific failures.
3. Submit the server preferences with a Build action. Disable duplicate submissions;
   make cancellation/retry explicit. Use the current auth token in memory, with
   state scoped to stable user/session identity and league rather than token text.
4. Reset/cancel on user or league changes and logout. Discard late results for
   an old request; closing a cancelled build must not later replace another build.
5. Render target kickoff, grouped candidate comparisons, pitch previews, scores,
   omitted-data explanations, required trades, trading-only purchases, finances,
   deadlines and protection advice. Clearly label estimate and incomplete-search
   status. Preserve a previous successful result as stale if a later refresh fails.
6. Parse sanitized builder diagnostics so mandatory conflicts, missing finance,
   no feasible XI, provider failure and incomplete search have different UX.
   The current generic `ApiError` retains only a category; add a bounded typed
   builder diagnostic path rather than discarding the new reasons.
7. Offer **Use as draft** only when all starters exist in the refreshed caller
   squad, IDs are mapped to current `playerTeamId`, formation is supported, and
   the target matches the editable/saveable lineup destination. A future-week
   preview must not be written to an unrelated current lineup. Warn before
   replacing a dirty draft; the existing explicit Save still performs the PUT.
8. External candidates show acquisition dependencies and may link to existing
   manual market actions. A rebuild/refresh after transactions is required before
   draft application. Do not embed automated trading in this feature.
9. Use existing Dialog/UI primitives, keyboard navigation, visible focus,
   announced progress/errors, and responsive pitch/table layouts in both themes.

The optional explanation layer is disabled by default and introduced after the
deterministic build passes acceptance tests. Use a provider interface that receives
only sanitized completed candidate data, score breakdowns and existing API news.
News stays within the current retrieval behavior (profile currently returns up
to ten items); do not add a new news scraper or historical backfill.

Use a disabled provider implementation for deterministic delivery and an optional
OpenAI Responses adapter as the first supported integration. Require a configured
server-side model when enabled; expose a model-specific effort allowlist and
prefer low effort when supported for bounded explanatory prose. Model choice is
a deployment/cost setting and does not block the core feature. Use Structured
Outputs for a small explanation object and validate candidate/evidence references;
no tool or transaction access is needed. See the official documentation cited in
the [research record](lineup-builder-research.md#5-optional-explanation-adapter).

Reasoning effort belongs in the configured LLM request, with supported options
validated there; no new MCP feature is required. Explain only facts in the
snapshot, cite returned news URLs when used, and treat news text as untrusted
content. The LLM returns a separate prose field and has no authority to change
IDs, eligibility, scores, trading plans or rankings. A provider timeout, disabled
configuration or invalid output leaves the deterministic build usable.

## 10. Ordered delivery milestones

Each milestone should be reviewable and carry its behavior-focused tests.
Prefer disabled-by-default integration until the required contract gates pass;
do not ship a “successful” placeholder builder with inferred financial values.

| Milestone | Deliverables | Exit criteria / dependencies |
|---|---|---|
| 1. Contract and source evidence | Follow the research record's specific read-only checks for money/reservations, shield expiry, source-block provenance and exceptional deadlines; verify formation entitlement. Scoring/scope defaults are already settled. | Required fields have verified semantics or explicit failure behavior. No speculative routes or real transactions to create evidence. |
| 2. Required data extensions | Verified Pydantic fields/adapters for season denominator, availability/recovery, history coverage and finances; corresponding Zod/CLI consumers. Extend scraping only if necessary. | Missing differs from zero/empty; malformed sources fail closed; existing detail partial-success behavior retained. Depends on 1. |
| 3. Pure target and scoring engine | Immutable snapshot records, target resolver, eligibility, six-section scoring, attainable bounds, weights, and explanation records. | Table/boundary tests and independent normalization cases pass. Can develop against milestone-1 fixtures while 2 proceeds. |
| 4. Search and financial planner | Mandatory position search, own/external alternatives, trading-only variants, ordered sales, per-stage debt/deadline/squad checks and final ranking. | Finds known cheaper alternatives; independent exhaustive small-pool oracle agrees; search-limit outcomes remain truthful. Depends on 3. |
| 5. API orchestration | Read adapter, authenticated build service/controller, DI/router/error integration, cancellation, limits and provenance. | End-to-end synthetic route tests pass with no Fantasy writes or credential leaks. Depends on 2–4. |
| 6. CLI and automated login | `fantasy-lineup-builder --league-id ... --preferences-file ... --json`; script registration; CLI POST contracts/helper; `fantasy-browser-session lineup-builder-analysis` using local HTTP. | Invalid files/preferences fail before login; read-only analysis works through app login and LaLiga pairing; auth imports neither API nor scraping. Depends on 5. |
| 7. Browser build and preview | Completed preference dialog, typed POST, loading/error/cancellation, grouped candidate views, score/trade details and gated draft application. | User-visible integration, auth/league isolation and desktop/mobile accessibility checks pass. Depends on 5; mocks can precede it. |
| 8. Optional LLM explanation | Disabled-by-default provider adapter, reasoning controls, grounded commentary and independent failure state. | Identical deterministic outputs with LLM on/off; provider failure cannot block candidates. Depends on 5 and 7. |
| 9. Documentation and release checks | Feature README, generated schemas, CLI/browser docs, source limitations, screenshots, performance observations and acceptance record. | All applicable checks below pass; enable the feature only with verified required data. |

Auth CLI additions stay in `backend/auth/src/fantasy_auth/cli/session_analysis.py`
and `browser_session/args.py` / `flows.py`. Use existing common auth and encoded
path helpers. A new POST helper must validate method, body and response contracts;
it is allowed only for this read-only planner in the new analysis flow. Do not
reuse a broad mutation callback that permits trading side effects.

## 11. Verification and acceptance

### Pure domain tests

- Every numeric boundary and neighboring value: averages, probabilities, market
  ratios/value tiers, rest minutes, injury days, 48h protection and 24h deadlines.
- Questionable penalty, recovering-unavailable -3 exactly once, explicit unknown
  risk versus missing risk, and no-news scoring regardless of explanation setting.
- All five published form categories; numeric-only form omission; preservation
  of complete empty versus missing injury history and invalid-row diagnostics;
  rejection of absent official-points placeholder zeros.
- Last-five match slots with nonappearances; one/fewer/no played matches; missing
  DAZN versus zero DAZN; same-season played-match denominator; no division by zero.
- Mixed-competition recent widgets must not truncate the five-LaLiga-fixture
  sample. Cup/European companion pages supply midweek minutes without changing
  the league-form/DAZN sample. Split-round conflicts do not create artificial targets.
- Every raw score, omitted criterion, conditional bound, effective weight and
  total against independently authored expected cases. Missing midweek/weather
  must leave other fixture criteria active. No candidate-pool normalization.
- Mandatory players with injury, unavailable data, wrong source/position and
  impossible formation; omitted formation considers every supported one.
- Owned-first grouping, each ranking key, exact score ties and seeded randomness;
  trading score cannot replace lineup score and extras cannot change group.
- Full bench retention, only original-owned sales, ascending sale trading score,
  no selling selected starters, buying/selling disabled, extras counted and valued.
- Debt before/after every step, sale-first settlement, reserved funds, a purchase
  that would incorrectly finance itself, no borrowing for clauses, zero final
  balance accepted, negative rejected, 24 accepted and 25 rejected.
- No accidental 120% growth ceiling, market-value opponent estimates, distinct
  actual clause metadata, and no half-value immediate-sale claim.
- Exhaustive small-pool comparison for search, a greedy-unaffordable/cheaper-feasible
  case, every mandatory candidate preserved, and truthful search-budget failures.

### Route, contract and CLI tests

Use `httpx.MockTransport` for real orchestration paths. Assert correct encoded
URLs, headers and public-read lack of bearer; missing/invalid JWT, `needs_reauth`,
caller membership, cross-user isolation, and malformed/non-JSON 200 → 502.
Ensure sanitized provider failures contain no bearer, secret or raw source body.

Cover strict unknown/incomplete input rejection, segment partial failures,
mandatory exclusions, missing financial fields, verified capacity fallback,
valid-zero finance, no feasible candidate, incomplete search, source cancellation,
rate/concurrency limits and changed snapshots. Assert that building calls no
Fantasy POST/PUT/DELETE even though the local operation is a POST.

Add shared fixtures under `contracts/` for Pydantic/CLI/Zod parity, valid builds,
malformed inputs and sanitized diagnostics. Extend endpoint contract coverage and
OpenAPI tests. CLI tests cover pre-login validation, POST body/response contracts,
path encoding, nonzero failure exits, and browser-session read-only behavior.

### Frontend and browser tests

Exercise preference submission, mandatory ID mapping, source/entitlement controls,
server target week, grouped results, detailed errors, cancellation/late responses,
logout and league-switch cleanup, and stale/incomplete results.

Verify draft replacement gating, dirty-draft confirmation, updated acquired
`playerTeamId` mapping, future-target save protection, full eleven-player replace
payload and premium field preservation where already supported. Builder submission
must not trigger a lineup PUT or any trading mutation.

Add `frontend/e2e/lineup-builder.spec.ts` with synthetic route fixtures. Check
keyboard/touch interaction, focus return, progress announcements, both themes,
375/800/1024/1440px and 200% zoom, without page-width overflow. Keep existing
lineup editing, standings and market flows working.

### Commands during implementation

Run relevant focused checks with each change, then the applicable release checks:

```bash
# Repository root: formatting/lint and generated contracts
uv run poe lint
uv run black --check backend main.py
uv run poe generate-openapi
uv run poe generate-endpoint-schemas
uv run poe check-openapi

# API: repository minimum is 80%; root/pre-commit release gate is 90%
cd backend/api
uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=90

# Auth: required when adding browser-session flow
cd ../auth
uv run pytest

# Frontend
cd ../../frontend
bun run lint
bun run build
bun run test
bun run test:browser -- e2e/lineup-builder.spec.ts e2e/lineup-standings.spec.ts
```

If private scraping routes/models change, also run scraping tests with the
existing 80% coverage gate and `uv run poe generate-scraping-openapi` from root.
If auth route/schema models change, regenerate its OpenAPI as well; a CLI-only
addition does not itself require an auth HTTP route. Synthetic tests must not
perform live writes. An optional authenticated live smoke build is read-only.

Measure cold/warm selected-source builds, maximum roster/market pools, call counts,
cache reuse, event-loop responsiveness and search completion. Record actual values
before setting production latency and concurrency limits. If a normal cold build
cannot finish within proxy/client request timeouts, introduce an authenticated,
caller-scoped asynchronous job contract before enabling that scope.

### Documentation to ship with implementation

- New `docs/api/lineup-builder/README.md`: routes, auth, preference defaults,
  source prerequisites, policies, scores, diagnostics, estimates and CLI examples.
- `docs/architecture.md`, `docs/api/README.md`, root `README.md` and `docs/README.md`:
  builder domain, orchestration and links.
- `docs/frontend.md`: build/results/draft workflow and verified screenshots.
- `backend/api/README.md`, `backend/auth/README.md`: CLI and browser-session flow.
- Affected players/teams/market/buyout/scraping READMEs for verified contract changes.
- Generated `backend/api/openapi.json` and `docs/api/endpoint-schemas.md`; scraping
  OpenAPI only if affected. Never hand-edit the generated schema document.

Completion requires a user to submit preferences, receive at least one fully
validated candidate or a precise failure, inspect all scoring/trading/financial
conditions, and apply an eligible owned XI to the draft without triggering trades.
The deterministic builder must remain fully usable without an LLM. Mark each
milestone with verified outcomes as implementation proceeds.

## 12. Continuation context

This file, the [research record](lineup-builder-research.md), and the
[implementation guide](api/lineup-builder.md) are the durable handoff.
The user authorized implementation on 2026-10-14. Code, generated schemas,
contracts and tests are now present. Further work should address new verified
upstream contracts or explicit feature changes, preserving the workflow's
settled scoring policies and read-only recommendation boundary.

## Implementation record

The backend scoring/search/trading engine, authenticated route, API CLI, independent
auth browser-session flow, dialog/results/draft integration, source provenance
fixes and optional disabled-by-default Responses adapter are implemented.
Shared wire fixtures and boundary/oracle/integration/browser tests accompany them.

Unknown nonzero cash commitments, active-shield expiry and exceptional round
opening conflicts remain explicit source gates, rather than guessed semantics.
Recovery derived only from fixture/matchweek text remains ineligible. Sale plans
require existing offers. The guide records these current limitations. No live
Fantasy mutation or paid explanation request was used for validation.

Validation on 2026-10-14: API 655 tests passed (92.90% coverage), auth 366
(93.98%), scraping 297 (88.39%), frontend 417 tests, production build and
ESLint. Three mocked Chromium browser flows passed, including round-gated draft application. Python ruff/black checks pass;
Python type checker is not installed in this workspace. Exact counts may increase
as additional edge-case checks are added.

Pending-bid compatibility update: listing-level bids are accepted when `userBids`
is absent. Distinct bid IDs reserve cash and possible squad slots. Until gross/net
reservation semantics are verified, results explicitly use a conservative cash
lower bound; this may understate usable cash and is not an exact balance.
