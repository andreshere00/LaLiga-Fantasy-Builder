# Lineup builder

`POST /lineup-builder/leagues/{league_id}/build` is an authenticated, read-only
application operation. The browser uses `/api/lineup-builder/...`. It authorizes
membership through the caller's `GET /leagues`; a caller cannot choose another
manager's team. All Fantasy, scraper and football reads reuse existing services.
No bid, offer acceptance, sale, clause, shield or lineup save is executed.

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

Defaults use owned players, all verified supported formations, no trades, five
results and no explanation. Unknown keys, duplicate choices and invalid bounds
are rejected with 422 before reads. Master IDs are mandatory XI constraints;
current squad-entry IDs are returned separately. Premium formations require the
league's explicit formations entitlement. The result contains first-kickoff
context, exact Decimal scores, attainable bounds, redistributed weights,
omissions, whole-squad balances, conditional transaction steps and source exclusions.
Decimal scores are JSON strings; frontend contracts convert them to display numbers.

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
preserved. For the default five results this normally means three owned and two
external proposals. A limit of one preserves owned-first priority. It returns
owned XIs before external XIs, with each group ordered by lineup-score sum,
projected cash, forwards, and seeded final ties. Trading scores
order purchases and sales. Extras are evaluated as descending trading-score
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

## CLI and browser

```bash
cd backend/api
uv run fantasy-lineup-builder --league-id 123 --preferences-file preferences.json --json

cd ../auth
uv run fantasy-browser-session lineup-builder-analysis --league-id 123 --preferences-file preferences.json --json
```

Preference files are validated before login. Auth maintains an independent contract
and calls only the application planning POST; it never imports API or scraping code.

The dialog gates chooser reads by selected source, cancels work on close or scope
unmount, retains a prior result as stale on refresh failure, and shows rule/trade
traces. Use as draft checks current roster identities, supported formation and
editable target week. Replacing an unsaved draft requires explicit confirmation.
Saving remains the existing separate action.

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
