# Lineup builder research and resolved policies

**Researched:** 2026-10-14. Read with the
[implementation plan](lineup-builder-implementation-plan.md).
The original Obsidian workflow remains the operational authority.
The scoring tables were revised on 2026-10-15; current intervals and the author's
clarified Fantasy-average cutoff are recorded in plan section 7 and the
[feature guide](api/lineup-builder.md#scoring-revision-2026-10-151).
This investigation used official LaLiga/UEFA guidance, FútbolFantasy's own
explanation of its indicators, and the repository's parser/API contracts.
No live account transactions, new login, or paid LLM requests were performed.

**Evidence** below means a published rule or observed code/fixture behavior.
**Builder policy** means an explicit implementation choice where public rules
cannot determine the author's scoring preferences. These policies are now
implementation defaults, rather than questions that block implementation.
Upstream field semantics still need the narrowly specified checks in section 6.

## 1. Resolution register

| Issue | Resolution | Basis |
|---|---|---|
| Shared numeric scoring endpoints | Use the exact intervals already listed in plan section 7; Decimal half-up for the nonnegative rest bonus. | Builder policy. These suitability bands are custom, not official Fantasy match-scoring rules. |
| Recent team results | Last five completed LaLiga fixtures, ordered by actual kickoff; exclude cups, Europe and friendlies from this criterion. | Builder policy aligned with existing league standings/form data. Other competitions remain congestion context. |
| Recent DAZN performance | Last five LaLiga club-match slots; average only published DAZN values from played matches in those slots. | Builder policy aligned with LaLiga Fantasy point provenance. Do not mix European or cup point systems. |
| Midweek context | Latest competitive non-LaLiga club match between the club's preceding completed LaLiga fixture and target first kickoff; use actual fixture identity and competition, not a weekday-only test. | Builder policy informed by UEFA schedules and their exceptions. |
| Numeric-only form | Omit unless a published categorical label accompanies it. No invented numeric thresholds. | FútbolFantasy publishes a categorical interpretation; no documented numeric conversion was established. |
| Five form categories | High/very high → good (+2), medium → average (0), low/very low → poor (-2). | Published category meanings plus the workflow's three scoring classes. Extend the missing fifth parser/API category. |
| Starting probability | Use the prediction only for its stated target matchweek; absent/mismatched predictions are omitted. | The source defines probabilities for the next jornada. |
| Injury-history completeness | Establish source-block coverage and parse quality; preserve absent versus complete empty history through every adapter. | Existing parser differentiates these, but the API currently loses information. |
| Borrowing | Maximum ordinary borrowing is 20% of current stage squad value; cash-only clauses/increases. No separate squad-growth ceiling. | Official rules. No new upstream capacity endpoint is required to establish the general rule. |
| Pending bids | Include commitments in affordability and pending acquisitions in squad reservations; recheck at settlement. | Official bid-cap guidance; exact API debit/reservation semantics remain a contract check. |
| Normal sales | Market value is a planning estimate. Settlement depends on a valid offer and the seller accepting it; a listing is not settled cash. | Official market guidance. |
| Immediate sale | Never use it to justify full-market-value proceeds. | Official rule: immediate sale pays 50%. |
| Clause lock versus shield | Keep purchase/assignment lock, timed advertising shield, and clause price as separate fields. | Official lock and shield guidance; shield expiry is absent from current typed reads. |
| Multiple games in one calendar week | Keep original Fantasy round identity. No automatic FPL-style double-gameweek multiplier or extra lineup. | Builder policy consistent with round-based lineup registration; exceptional round deadlines require source verification. |
| Optional LLM | Disabled by default; configurable explanation adapter, with an OpenAI Responses adapter as the first supported option. Model is server configuration; effort is model-specific. | Implementation choice supported by official API documentation. No model purchase or account setup is required for deterministic delivery. |

## 2. Football and player-indicator findings

FútbolFantasy states that its starting percentages concern the next jornada.
Its form arrows reflect the last three jornadas, with extra weight on the most
recent, using multiple Fantasy scoring inputs. It publishes five performance
categories, and distinguishes injury, injury doubt, available-after-injury,
suspension and other absence states.
[Source: FútbolFantasy's team-page information panel](https://www.futbolfantasy.com/laliga/equipos/real-madrid).

**Implementation consequence:** form is usable categorical evidence even when
`visual_only=true`. Its value is not a DAZN score, medical clearance or universal
0–10 rating. Use the mapping above and preserve the source category in explanations.
There is no sourced reason to turn a bare number such as 7.5 into good/average/poor.

The current `_FORM_RATINGS` table in
[`extractors/status.py`](../backend/scraping/src/fantasy_scraping/parser/extractors/status.py)
has four mapped arrows, and `Form.rating` / `FormStat.rating` have four values.
Verify the missing visual class against source HTML, then support `very_bad`
through the parser, API, auth consumer if affected, and Zod contracts. Do not
guess a CSS identifier from the category name. Missing form stays omitted.

UEFA's 2026/27 rules normally schedule Champions League on Tuesday/Wednesday,
with a Thursday exception, and Europa/Conference League on Thursday with
competition-specific exceptions. Consequently, actual competition/date identity
is stronger evidence than “played on Wednesday.”
[Champions League](https://documents.uefa.com/r/Regulations-of-the-UEFA-Champions-League-2026/27/Article-23-Match-dates-and-fixtures-Online),
[Europa League](https://documents.uefa.com/r/Regulations-of-the-UEFA-Europa-League-2026/27/Article-23-Match-dates-and-fixtures-Online),
[Conference League](https://documents.uefa.com/r/Regulations-of-the-UEFA-Conference-League-2026/27/Article-23-Match-dates-and-fixtures-Online).

**Builder policy:** use the latest competitive interleague fixture for the
workflow's single midweek criterion, including domestic cups and Supercopa.
Exclude friendlies and national-team matches from this club criterion. Unknown
competition is not proof that a fixture qualifies. Do not add extra deterministic
fatigue points for other matches, travel, elapsed days or minutes above 90;
the workflow has no rules for those. Before an upcoming midweek match is played,
only its known congestion condition is applicable; minutes/result/rest are omitted.

This is an implementation definition, not a UEFA Fantasy scoring rule. Likewise,
using league-only team form is a deliberate scope decision: “form” has no universal
competition scope. The builder explains the scope and keeps competition identity
on every record so the policy can be versioned later without mixing samples.

## 3. Calendar, recovery and source coverage

LaLiga's lineup guidance registers the saved XI for the jornada and rewards points
at jornada completion, rather than after each individual match.
[Source: players that score during a jornada](https://laligafantasy.zendesk.com/hc/es/articles/115002390473--Qu%C3%A9-futbolistas-de-mi-equipo-suman-puntos-durante-la-jornada).
Official schedule announcements retain original round labels when fixtures are
moved across calendar dates.
[Source: LaLiga postponed/advanced fixtures](https://www.laliga.com/noticias/todo-lo-que-tienes-que-saber-sobre-los-partidos-aplazados-de-laliga).

**Builder policy:** two matches played in the same calendar week are not
automatically two matches in the target Fantasy round. Join on competition,
season, original round and fixture ID, then sort actual kickoff for recent form.
A postponed fixture from an already-started round does not become a new build
target. Unknown dates stay unknown. Do not average opponents or weather across
different rounds, or multiply scores by the number of calendar-week appearances.

The public sources inspected did not establish one universal lineup-lock policy
for every unusually advanced/split round. Use the workflow's first-match reference
for normal rounds, and verify `openingWeekDate` / `isLive` against fixtures.
Return `target_deadline_conflict` when they disagree in an exceptional round;
do not silently adopt another game's rule or select an artificial deadline.
The existing one-target-fixture model rejects contradictory duplicates or a
genuine unsupported multi-fixture target with a specific diagnostic.

For recovery, `_expected_return_date()` currently transforms “Disponible para
la jornada N” into the date of that player's upcoming match. That is a derived
match date, not a published recovery timestamp. Preserve the availability
matchweek and precision separately; do not relabel the fixture date as medical
evidence. A dated forecast strictly before target first kickoff is usable.
A same-day date or matchweek-only forecast does not by itself establish recovery
before the first match of the whole round. Use explicit earlier availability
evidence when available; otherwise exclude the uncertain starter with a reason.
Questionable remains eligible with the workflow penalty.

Repository evidence establishes a practical route for completeness and averages:

- [`extractors/injuries.py`](../backend/scraping/src/fantasy_scraping/parser/extractors/injuries.py)
  returns `None` for an absent history block and an object with `entries=[]` for
  a recognized empty table. However, the live-list layout can discard unparsable
  rows without per-row warnings. Add row counts/drop diagnostics before certifying
  completeness. A complete source view means complete *published* history as of
  retrieval, not proof of unreported medical events or future recovery.
- [`services/wire_map.py`](../backend/api/src/fantasy_api/services/wire_map.py)
  uses `history.get("entries") or history.get("items")`; an empty list can become
  `None`. Its normalized document also drops top-level `missing` and
  `fantasyPoints`. Replace truthiness with explicit presence/type checks and
  carry the necessary provenance and official aggregates into normalized schemas.
- [`PlayerStatsService._injury_history_entries()`](../backend/api/src/fantasy_api/services/player_stats.py)
  subsequently maps an absent/non-list history to `[]`. Expose coverage separately
  so the public list alone cannot trigger the no-injury bonus.
- `FutbolFantasyPlayer` already contains `fantasy_points`, `season_stats`,
  `missing`, and `warnings`. The season fixture includes `matchesPlayed`, and
  the official aggregate includes total, average and `matchesCounted`. Prefer
  verified matching season/competition/scoring mode and played counts; do not
  combine an all-competition denominator with league-only points. Catalog points
  remain an alternative only when their scope agrees.
- The official-points extractor returns placeholder zeros plus
  `points_mode_missing` when the block is absent. Those zeros cannot become a
  builder season total. Validate presence, scoring mode and diagnostics first.

The existing private
[`PlayerDocumentService`](../backend/scraping/src/fantasy_scraping/services/player_document.py)
requests player and competition pages, and
[`merge_competitions()`](../backend/scraping/src/fantasy_scraping/parser/merge.py)
merges competition fixtures. Reuse this for midweek player minutes. Missing
competition pages remain missing criteria; they need no speculative new provider.

## 4. Fantasy finances, market timing and protection

Ordinary maximum offer capacity is cash plus 20% of squad value; clause purchases
cannot borrow.
[Official debt guidance](https://laligafantasy.zendesk.com/hc/es/articles/360007533594--Puedo-quedarme-con-saldo-negativo-en-mi-presupuesto).
The regulations also forbid debt-funded clause increases and close clause
acquisitions 24 hours before a jornada. Negative lineup-time cash prevents scoring.
[Official regulations](https://laligafantasy.zendesk.com/hc/es/articles/360025679853-Reglamento).

Use the current squad *before* an ordinary purchase to establish offer headroom;
an incoming player cannot retroactively fund its own bid. Recheck after every
settled sale/purchase, since sales also reduce the squad-based debt allowance.
Zero final cash remains accepted under the operational workflow. Some FAQs use
“positive” informally, while the regulations and deadline help specify negative
cash as the failure condition; do not change the workflow to a strict `>0` test.
[Deadline help](https://laligafantasy.zendesk.com/hc/es/articles/115002402014--Cu%C3%A1l-es-la-fecha-tope-para-guardar-la-alineaci%C3%B3n-de-una-jornada).

Active offers count toward the 24-player cap, and a winning bid may fail assignment
if clause purchases have filled the roster before resolution.
[Official bid restrictions](https://laligafantasy.zendesk.com/hc/es/articles/115002401934--Por-qu%C3%A9-no-puedo-hacer-una-oferta-o-una-puja-por-un-jugador).
Count unique pending acquisitions and existing holdings at submission and settlement,
without counting an already-owned listed footballer as a new acquisition.

Free-player bids resolve at listing expiry. User listings can remain for up to
three days, and the owner accepts/rejects offers. Automatic league purchase offers
may differ from market value by up to 10%.
[Official market operation](https://laligafantasy.zendesk.com/hc/es/articles/115002401674--C%C3%B3mo-funciona-el-mercado-de-fichajes-de-LALIGA-FANTASY).
Thus, do not hard-code an overnight market cycle or use listing expiry as a
guaranteed seller payment time. A valid existing offer accepted before the sale
deadline supports a concrete route; a future offer is an explicitly conditional
route. Sequence projections use market value as required by the workflow, and
later execution rechecks actual offers and prices.

Immediate sale is processed immediately for 50% of market value.
[Official immediate-sale rule](https://laligafantasy.zendesk.com/hc/es/articles/115002390653--Qu%C3%A9-es-la-venta-inmediata-de-un-jugador-de-mi-plantilla).
It cannot supply the full-market-value cash in a builder plan; no amount of
deadline urgency changes that distinction.

Newly assigned/acquired players have a two-week clause-acquisition lock.
[Official clause acquisition](https://laligafantasy.zendesk.com/hc/es/articles/360025683553--Qu%C3%A9-significa-pagar-una-cl%C3%A1usula).
Advertising shields provide a separate temporary 24h/48h protection and have
per-jornada activation limits.
[Official shield explanation](https://www.laliga.com/noticias/el-doble-blindaje-llega-a-laliga-fantasy).
The 2026/27 announcement confirms shielding continues, but does not publish a
replacement field-level expiry contract.
[Current-season announcement](https://www.laliga.com/noticias/laliga-fantasy-ya-esta-disponible-para-la-temporada-2026-27).

Use `buyoutClauseLockedEndTime` for the assignment/acquisition lock. `isShielded`
is a state, not its expiry. Do not compute a shield expiry from the lock end,
from 24h/48h plus build time, or from clause price. Verified combined protection
ends at the later active expiry. If shielding is active but its expiry is unknown,
opponent clause eligibility is unknown and that route is excluded. Ordinary
offers need their own permission checks; a shield protects against clauses,
not against every possible sale route. The workflow's 48h buffer still applies
to protected opponent players; it is a builder policy, not the official closure.

The broad regulations contain inconsistent initial-clause wording. The dedicated
help gives configurable relationships and examples in which clauses follow
market value unless raised.
[Dedicated clause-value guidance](https://laligafantasy.zendesk.com/hc/es/articles/360025683593--C%C3%B3mo-se-establecen-las-cl%C3%A1usulas).
Never reconstruct clause price using an assumed 66%/166% formula. Use its
actual read field as acquisition metadata and retain market value for estimates.

## 5. Optional explanation adapter

Resolve the provider question at the architecture boundary: deterministic delivery
uses a disabled adapter; the first optional integration may use OpenAI Responses.
Require a server-configured model when enabled, with a model-specific effort
allowlist. Expose only supported user effort options, prefer low effort when
supported for this bounded prose task, and omit the parameter for models that
do not support it. Never map a high/low MCP setting to model reasoning implicitly.
[Official reasoning documentation](https://developers.openai.com/api/docs/guides/reasoning).

Request a constrained explanation object with candidate IDs and references to
already-supplied evidence using Structured Outputs; validate references against
the completed build. No tool calling, live news browsing, scoring rewrite or
transaction access is needed.
[Official Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
Set explicit output/time budgets. Invalid output, refusal, timeout or missing
configuration produces an independent explanation status. Model choice is a
deployment/cost setting, not an unresolved football concept or deterministic gate.
Do not enable a paid provider as part of this research or the default rollout.

## 6. Remaining verification is specific integration work

Public football/Fantasy research cannot prove an undocumented JSON field's debit
semantics. These checks remain in milestone 1; none requires a new scoring
preference from the user.

| Check | Evidence to collect during implementation | Failure behavior |
|---|---|---|
| `teamMoney` / `teamInvestment` / pending reservations | Read-only snapshots for an account with naturally existing pending bids, comparing team money, league summary and complete user bids at the same as-of time. Establish whether cash is already debited and what investment includes. Synthetic zero-investment fixtures do not prove this. Do not place a bid to obtain evidence. | No affordability result with unknown required commitments; no double subtraction or invented headroom. An explicitly empty, complete bids snapshot has zero commitments. |
| Timed shield expiry | Discover an actually published field in existing roster/league-card/shield reads, verify its timestamp semantics and expose it in typed schemas. Current `ShieldStatus` has only the boolean. | Exclude an active-shield opponent acquisition with unknown expiry; preserve owned player and omit unsupported protection scoring/advice. |
| Source coverage and totals | Preserve original block presence, parsed/dropped row counts, `missing`, warnings, season identity and official points mode before lossy normalization. Verify fifth form visual mapping against HTML. | Omit optional unsupported criteria; exclude players missing required market history or recent played records; never treat placeholder zero as published. |
| Exceptional split-round deadline | Capture Fantasy current/next metadata and the same round's fixtures when an advanced/split round occurs; verify which round and registration boundary the game publishes. | `target_deadline_conflict` rather than an invented schedule or another game's double-round rule. Normal rounds remain supported. |

These are acceptance checks, not speculative new features. Implement the published
rules and resolved policies now, close the data checks using verified reads,
and keep unsupported cases explicit. The user's Obsidian specification was not
edited by this investigation.
