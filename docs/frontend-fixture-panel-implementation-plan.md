# Lineup page: current and next fixture matches

Status: implemented. Updated: 20 October 2026.

The original plan is retained below. The implementation record and production
captures at the end describe delivery, resolved source semantics, and checks.

Add a compact, full-width LALIGA matches panel above the lineup controls. Here,
**fixture means the complete matchweek**, consistent with the existing Fixture
picker. Keep the panel on that round from its first match until its last match
finishes, including breaks between games. Then automatically show the next
round's pairings, dates, and kickoff times, without results. Include stadium
weather forecasts when available. The weather extension adds a small API
aggregate to the original frontend scope; it remains optional at runtime.

## Proposed appearance

Use the existing local adaptation of the shadcn Base UI
[Card](https://ui.shadcn.com/docs/components/base/card), with
[Scroll Area](https://ui.shadcn.com/docs/components/base/scroll-area) for a
horizontal match list and [Badge](https://ui.shadcn.com/docs/components/base/badge)
for the round state. These components are already installed in this repository.
Compose `CardHeader`, `CardTitle`, and `CardContent`; use a normal header action
container because the local Card does not currently export `CardAction`.
Reuse the square shared Button for refresh and scrolling.

Keep the application's square surfaces, thin neutral borders, Anton headings,
AT Aero body text, coral status accents, and semantic light/dark tokens. One
outer Card contains a flat list separated by rules. Reserve approximately
230–255px per match and about 310px overall desktop height, including weather.
The desktop list shows several matches at once; the remaining matches are accessible through
horizontal scrolling and labeled Previous/Next scroll buttons. No auto-rotation.

Each match shows both club crests and names, its date, and either kickoff time
or a text status with the available score. Include dates on every match so they
remain understandable while scrolling. A scheduled match has an em dash for
each unavailable score; a confirmed score of zero remains `0`. Do not show a
scheduled match as `0–0`. Mark actual live matches with both a text label and a
coral indicator. The round badge says **In progress** even between live games;
individual finished games say **Finished**.

Use Madrid time consistently, matching the football calendar: explicitly label
`Europe/Madrid` in the header, format each offset-aware kickoff with `Intl`, and
honor CET/CEST changes. Use semantic `<time datetime="…">` elements in production.
Unknown kickoff times say **Time TBC**; unknown dates say **Date TBC**.

Below each upcoming match, show a compact weather icon, condition and
temperature in °C, followed by rain probability and wind in km/h. Label these
values **Forecast**, with an OpenWeather source label in the footer. Keep
missing metrics as em dashes and retain legitimate 0°C, 0% rain, and calm wind.
For matches beyond the forecast window, show **Forecast closer to kickoff**.
Finished matches need no weather row. A live match may retain a forecast
received before kickoff, explicitly labeled **Saved kickoff forecast**, with
its retrieval time available; it is not an observation of current weather.

The following images are **design mockups**, rendered over the existing app
with fictional account data, matchups, dates, scores, and weather. They are not
captures of an implemented feature or a verified sporting schedule. Club crests come
from the public image URLs already recorded in `assets/teams_master.json`.

### Next fixture: desktop, light theme

![Proposed upcoming fixture panel above the lineup controls, showing club crests, kickoff dates and times, blank results, temperature, rain probability, and wind.](images/mockups/lineup-fixtures-upcoming-desktop.png)

### Active fixture: desktop, dark theme

The initial viewport brings a live match into view alongside finished and
scheduled matches from the same round. Updates preserve the user's scroll.

![Proposed active fixture panel in dark mode, showing finished scores, a live result with a saved kickoff forecast, and weather for the remaining scheduled match.](images/mockups/lineup-fixtures-active-desktop.png)

### Next fixture: mobile

The header and controls wrap. One match and part of the next remain visible to
suggest horizontal scrolling; the page itself must not overflow sideways.

![Proposed mobile fixture panel with club crests, a compact forecast, a preview of the next match, and the lineup controls below.](images/mockups/lineup-fixtures-upcoming-mobile.png)

The [editable HTML preview](design/lineup-fixtures-preview.html) includes theme
and state switches plus local scrolling. It is a planning artifact: its data is
fixed, refresh does not call the API, and it does not implement round selection.
Production will use the existing React/shadcn primitives. The preview includes
a weather-availability switch to inspect missing forecasts.

## Existing integration points and data

| Location | Relevant behavior |
|----------|-------------------|
| `frontend/src/features/lineup/LineupPage.tsx` | `.board` contains the full-width `.board-controls-bar`, then ranking, pitch, and squad. Insert the new panel as the first board child. |
| `LineupPage.css` and `lineup-layout.css` | Three desktop columns become a single column at the existing width/aspect-ratio breakpoint. Give the panel `grid-column: 1 / -1`, `min-width: 0`, and an explicit mobile order before the controls. |
| `frontend/src/api/queries.ts` | `useCurrentWeekQuery` already queries `['calendar', 'current']` and refreshes every 30 seconds. |
| `useLineupBoard.ts` | Already fetches current/displayed week fixtures under `['calendar', 'fixtures', week]`. Reuse this cache rather than creating panel-only duplicate keys. |
| `frontend/src/api/client.ts` and `schemas.ts` | Existing paths and Zod contracts cover current week, week fixtures, club IDs, match states, and nullable scores. |
| `frontend/src/api/clubMedia.ts` | `clubMediaFromId` resolves real-club names and crests from the bundled teams master. No player-catalog or stats request is needed for panel images. |
| `frontend/src/components/ui/` | Card, ScrollArea, Badge, Button, and existing loading primitives are available. |
| `frontend/src/features/players/PlayerMatchesSection.tsx` and `playerDetailWidgets.ts` | Existing weather condition mapping, icons, unavailable-reason copy, and wind conversion can be shared without importing the full player section. |
| `backend/api/src/fantasy_api/clients/openweather.py`, `domain/weather.py`, and `domain/venues.py` | Existing provider client, forecast-slot selection, and committed stadium coordinates. |

Keep these existing authenticated application reads for fixtures and scores:

| Read | Purpose |
|------|---------|
| `GET /api/calendar/current` | Current round, `nextWeek`, `previousWeek`, and `isLive`. |
| `GET /api/calendar/weeks/{week}` | Match list, kickoff dates, real-club IDs, state, and home/away scores. |

The frontend prefix `/api` is proxied to the API service's `/calendar/*` routes.
These routes require the internal app JWT, but call public Fantasy upstream
paths without a LaLiga bearer. Preserve the page's existing access gates.
Weather requires the additional application-owned aggregate proposed below;
it does not require a new auth flow or scraping request.
Avoid `/stats` for this panel: it is a much larger response, and its match IDs
are explicitly documented as different from calendar fixture IDs.

Confirmed repository evidence: scheduled state is `1` (Calendar README), and
finished state is `7` (Standings README and standings service). The generic
`fixtureHasStarted` helper treats every non-`1` state as started; that is too
broad for safely labeling a match live or deciding a round is complete.
Verify live, halftime, postponed, suspended, and cancelled wire states from
existing/read-only source evidence before assigning those labels. A test's
use of state `2` is not sufficient upstream documentation.

## Weather availability and data contract

Reuse the configured `OPENWEATHER_API_KEY` on the API service. Do not expose the
key to the browser or add a second weather provider/subscription for this scope.
The repository's OpenWeather client already calls `/data/2.5/forecast`; the
[official forecast documentation](https://openweathermap.org/api/forecast5)
confirms a five-day window with three-hour intervals. The existing selector
uses a 120-hour horizon and a nearest-slot tolerance of 90 minutes. Forecast
availability also depends on the actual last returned provider slot. Do not
substitute today's weather, a city-wide daily average, or a guessed forecast
for the stadium at kickoff.

### Proposed API: one weather response for a matchweek

Add **`GET /calendar/weeks/{week}/weather`** in `backend/api` (browser path
`/api/calendar/weeks/{week}/weather`). This is a new application aggregate, not
an assumed LaLiga upstream route. Require the verified internal JWT, matching
the existing Calendar routes; no LaLiga bearer or user-supplied coordinates.
Read fixtures through the calendar repository and forecasts through the
existing OpenWeather client behind a weather repository/service. Follow the
controller → service → repository convention and wire shared dependencies in
`api/deps.py`. No calls to player-detail endpoints or scraper are needed.

Define Pydantic and Zod read models for an envelope with `weekNumber`,
`generatedAt`, and `matches`. Each row contains the calendar `fixtureId`,
`localId`, `visitorId`, normalized `kickoff`, venue/source metadata, the existing
weather snapshot fields, a nullable unavailable `reason`, and `fetchedAt` for
the actual provider retrieval time. `forecastFor` identifies the selected
three-hour slot; it is different from `fetchedAt` and the requested kickoff.
`generatedAt` must not make cached forecasts look newly retrieved. Reuse the
existing weather payload shape, moving it to a shared schema module if needed
while preserving the player-stats API's existing wire contract.

Join weather by **calendar fixture ID and the matching home/away IDs and
kickoff**, never by list position or stats-match ID. A rescheduled game or
changed venue must invalidate the old join. Resolve the match venue from
verified fixture venue metadata when available; otherwise use the home club's
verified entry in `VenueDirectory`, after confirming the club-ID namespace and
that the committed stadium is current. Handle known neutral/temporary grounds
explicitly; an unverified venue returns `venue_unknown`, not a forecast for an
arbitrary city or the user's location.

Extract reusable forecast lookup/cache orchestration from
`PlayerStatsService._weather_for_match` into a service used by both player
matches and calendar weather. Reuse the existing provider client and pure slot
selector. Share successful per-venue forecast caching with the existing
configurable `weather_ttl_seconds` (currently 1,800 seconds), coalesce concurrent
requests, and bound matchweek fan-out to three concurrent venue requests. Key
the provider cache by verified venue coordinates and request parameters; pick
the kickoff slot separately per match. Validate kickoff/horizon and missing
configuration before making provider calls. Keep the shared client lifecycle
in the container and preserve the existing player-page behavior.

### Missing, past, and failed forecasts

| Condition | Match weather behavior |
|-----------|------------------------|
| Valid future kickoff within provider coverage | Condition/icon, °C, rain probability, wind in km/h; source and retrieval time available. |
| Kickoff beyond coverage | `beyond_forecast_horizon`; **Forecast closer to kickoff**. Automatically retry as the match approaches. |
| Missing/unverified stadium | `venue_unknown`; **Stadium forecast unavailable**. |
| Missing/invalid kickoff | `kickoff_unknown`; **Kickoff time needed for forecast**. |
| Missing API key | `disabled`; **Weather unavailable**. Fixtures and scores still work. |
| Provider timeout, non-2xx, or malformed weather payload | `provider_unavailable`; **Forecast unavailable** for that match; retain other successful forecasts. |
| Kickoff passed / live | No new forecast request for a past kickoff. A prior snapshot retained during this session may remain as **Saved kickoff forecast**, with its original time; otherwise show **Kickoff forecast unavailable**. |
| Finished match | Omit weather. No historical-weather API or observation is promised. |

Return HTTP 200 with explicit per-match unavailable reasons for optional
weather failures, including when the provider is disabled. A calendar failure
or malformed fixture list still returns its sanitized error; never manufacture
an empty successful schedule. Extend the calendar weather reason type with
`match_started` for past kickoffs rather than changing the existing player
route's meanings. Provider errors must never contain API keys, request URLs
with `appid`, or raw bodies. Validate precipitation probability in [0, 1],
wind as nonnegative, and humidity in [0, 100]; negative temperatures are valid.
Convert probability to percent and m/s to km/h exactly once in the presentation
layer. Unknown metrics are not zero.

### Frontend lifecycle

Weather is a separate query from the 30-second fixture/score polling. Query
only the displayed round when it has eligible upcoming matches. Key by the
week and a stable signature of calendar fixture IDs, home/away IDs, and
kickoffs, so rescheduling invalidates weather. Use 30-minute stale/poll timing
while visible, pause polling in hidden tabs, and refetch stale data on
focus/reconnect. Re-evaluate horizon eligibility as time advances even after a
`beyond_forecast_horizon` response; do not cache that reason for the whole week.
Manual refresh can retry weather, while the server's venue cache controls
provider usage. Render fixtures immediately with a weather-only loading state.

Keep a previously received pre-kickoff snapshot for a live match only while its
fixture/venue/kickoff identity still matches, label it saved, and clear it with
the session/round. Never treat the cached forecast as observed live weather.
On a failed refresh, mark retained weather with its original update time;
scores, round selection, lineup editing, and scrolling remain independent.
Keep the OpenWeather source and weather freshness separate from the score
update timestamp. Reuse existing weather SVGs with theme-aware color and
visible condition text so an icon is never the only description.

## Round-selection rules

The panel follows the competition calendar independently of the lineup's
Fixture picker, selected manager, Fantasy league, formation, or draft. Browsing
an old lineup does not turn this panel into a historical-results panel.

Implement a pure selector with explicit loading, active, upcoming, complete,
and unavailable outcomes. Take the normalized current metadata, fixture
snapshots, and time as inputs; do not read `Date.now()` inside the selector.

| Observed state | Display |
|----------------|---------|
| Current round contains only scheduled matches and has not begun | Show that round as **Up next**, with dates/times and no results. Do not skip it just because `nextWeek` exists. |
| Round has begun and any match remains unfinished | Keep the whole round **In progress**. Show finished/live results where known and dates/times for unplayed matches. |
| No match is currently live, but the round still has scheduled matches | Keep the same **In progress** round. An overnight gap is not completion. |
| A complete, nonempty round snapshot shows every match finished | Fetch the explicit valid `nextWeek` and switch to its upcoming matches once ready. Do not wait for a delayed `weekNumber` rollover. |
| Metadata has already advanced to an unstarted round | Show that round as upcoming once the preceding active round is confirmed complete. Validate the known active/`previousWeek` candidate rather than silently dropping unfinished results. |
| Next-round data is loading or fails after completion | Retain the last completed round, labeled **Finished · Loading next fixture** or **Next fixture unavailable**, with retry. Never label old rows as the next round. |
| Final round is complete and no valid next round exists | Show **Season complete** and the last results. Never request round 39 or wrap to round 1. |
| Current metadata or match state is missing/unknown | Preserve correctly labeled cached data if available; otherwise show a panel-local unavailable state. Never fabricate a round number or a live status. |

Completion requires verified finished states, not score presence, `isLive:
false`, a passed kickoff, a fixed match duration, or `closingWeekDate`. A 0–0
score can be live, and the calendar's opening/closing timestamps may represent
Fantasy windows. Require a credible full round: deduplicate by fixture ID and
validate the expected ten unique pairings/twenty participating clubs for this
competition before using an all-finished result to trigger rollover. Missing,
conflicting, or partial data cannot prove completion. A successful empty array
is an empty/unavailable schedule, not a finished round.

Once started, retain the active round identity while fresh requests reconcile
calendar metadata and matches. On a cold load, inspect `previousWeek` when the
reported current round is unstarted and source semantics indicate the pointer
can advance early. Do not scan the whole season or select an old postponed game
as the current round simply because it is unfinished. Verify pointer behavior
and the deferred-match policy in the first delivery step. Default to retaining
an unfinished round until completion can be established; if postponements can
span rounds, document the source's authoritative round-closing rule before
allowing those exceptions to trigger advancement.

Use `nextWeek` when supplied and valid. If it is absent, accept a newly reported
current round only after metadata refresh establishes its identity; do not
invent a future schedule by incrementing `board.maxWeek`, which is an editing
bound rather than the panel's calendar selector. A contradictory snapshot must
not make the panel oscillate between rounds. If the next round has already
started by the time it is fetched, render its real active state and known
results rather than hiding them as upcoming.

## Delivery sequence

1. **Verify and normalize the calendar contract.** Record the read-only state
   mapping, round-pointer behavior, deferred-match semantics, and club-ID
   namespace in the Calendar README. The bundled club directory indexes both
   `id` and `dspId`; verify current fixture IDs resolve to the intended clubs and
   do not silently accept an ambiguous ID collision. Add a small typed match
   view model and selector under the lineup feature, e.g.
   `fixturePanelModel.ts`. Preserve unknown fields/states as unavailable rather
   than guessing. Prefer a valid, offset-aware `matchDate`, then a valid `date`;
   use `time` only if it is itself a verified full timestamp. Do not parse a bare
   clock string as a date. Resolve names/crests from `clubMediaFromId`, retain
   matches with unknown clubs using `Club <id>`/`Club unavailable`, and provide
   a neutral image fallback. Keep zero, missing, live, and final scores distinct.

2. **Implement the optional matchweek weather aggregate.** Add the route,
   read schemas, service/repository wiring, shared weather cache/lookup, and
   bounded fan-out described above. Reuse `VenueDirectory` and the existing
   provider client; do not route through player profiles. Extend the read-only
   `fantasy-calendar` CLI with a weather option, using its existing JWT/session
   resolution and automated login, and document the option in the API README.
   Exercise JWT gates, public-calendar/no-bearer behavior, provider key
   redaction, partial failures, caching, and forecast boundary cases with
   `httpx.MockTransport`. Preserve player-stats response contracts and add
   regression coverage for the shared-service extraction.

3. **Share fixture fetching and implement the panel data hook.** Extract a
   `useWeekFixturesQuery(week, enabled)`/shared query-options helper from the
   repeated board queries, preserving the existing calendar keys, abort
   signals, validation, auth, and board behavior. Build `useFixturePanel` from
   that helper and `useCurrentWeekQuery`; only enable valid, positively
   identified weeks after successful metadata. Reuse requests when the board
   and panel need the same round. Fetch the next round only when needed for
   handoff, plus the preceding candidate only when needed for reconciliation.
   Keep the currently displayed rows during a background refresh, but never
   carry old-week placeholder rows under a new-week heading. Clear panel-owned
   state with the authenticated session and let the existing query-cache clear
   on logout/session expiry isolate users.

   Keep the existing 30-second polling cadence while the lineup is visible,
   including the upcoming state so kickoff/rollover is detected. Do not enable
   background/hidden-tab polling; refetch on focus/reconnect. An explicit Refresh
   refetches current metadata and the displayed round, then reconciles the next
   round if completion is newly established. Avoid token strings in cache keys.
   The existing board shares these queries, so a polling-policy change must be
   tested against lineup scoring/editability rather than applied globally as
   an incidental cleanup.

   Add the separate weather query and typed response registration to
   `api/client.ts`, `schemas.ts`, and `queries.ts`. Join by fixture identity as
   described above. Weather errors and delays do not enter `board.isLoading`
   or the panel's fixture-error/round-selection state.

4. **Build and integrate `FixtureMatchesPanel.tsx`.** Keep the panel's queries,
   pending state, and failures independent of `board.isLoading` and its error
   aggregation. Insert the Card before `.board-controls-bar`; leave existing
   lineup editing/navigation intact. Add `FixtureMatchesPanel.css` and minimal
   grid-order rules. Use a semantic list of matches, each with accessible home,
   away, status, score, and kickoff text. Reuse the existing image-error pattern
   with fixed image boxes and `object-fit: contain`; decorative crests have
   empty alt text beside visible club names. No invented links or match-detail
   actions. On first displaying an active round, bring a live match into view
   without moving keyboard focus; preserve manual scroll on subsequent polls.
   Reset scroll for a genuine round change.

   Add the compact weather summary and explicit missing/saved/stale states.
   Reuse the existing condition mapper and weather assets; share icon/reason
   formatting and numeric conversion only where needed. Keep the compact
   summary local to the panel and preserve the player page's expanded layout.
   Test both consumers.

   Show a panel-sized skeleton/loading state, a clear empty schedule, and Retry
   for first-load failure. Keep useful rows visible after refresh failure and
   label them **Update unavailable**, with the last successful update time.
   Do not keep claiming stale data is live/current. Dates without a known time
   and finished matches without supplied scores remain explicitly incomplete.
   Use a concise polite live region for changes in score/round/status; do not
   announce the entire list or each polling timestamp. Keep all matches
   keyboard/touch accessible, show focus, support reduced motion, and preserve
   the application's 44px action targets.

5. **Verify behavior and document delivery.** Add focused Vitest tests for
   round selection/normalization and component/query lifecycle tests for
   refreshing, transitions, and errors. Add a synthetic Playwright scenario
   using `e2e/fixtures.ts`, with stateful round responses and a fixed clock.
   Test the full current-to-next transition while the page stays mounted.
   Update `docs/frontend.md`, the Calendar README's verified semantics and new
   route, shared weather notes in the Players README, the Calendar architecture
   row, service README/CLI notes, and the screenshot index with implemented
   captures. Mark this proposal
   implemented only after its acceptance checks pass.

## Acceptance and verification

- The panel appears above the controls at 375, 800, 1024, and 1440px, in both
  themes and a layout equivalent to 200% zoom; smoke-check 320px as well. The
  page has no horizontal overflow, every match is reachable, club images fit,
  and lineup/ranking/squad controls retain their behavior.
- Upcoming current round: dates, local kickoff times, crest/name pairs, and
  no fabricated results. Scheduled upstream zero placeholders remain hidden.
- Active round: live/finished scores include real zeroes; unplayed games show
  times. A night with no live games and `isLive: false` keeps the same round.
- Last match finishing triggers the next-round fetch/switch without reload,
  including when current metadata lags. Early pointer advancement, failed
  handoff, and a next round already underway are handled consistently.
- Empty/partial rounds, duplicate or conflicting IDs, unknown states, malformed
  timestamps, missing clubs/crests/scores, postponed/suspended matches, season
  end, and missing `nextWeek` do not produce false completion or invalid reads.
- Initial and background failures remain local to the panel. Retry, request
  cancellation, query deduplication, focus/reconnect, hidden-tab behavior, and
  logout/session reset work. Switching lineup week or manager changes neither
  the displayed competition round nor an unsaved draft.
- Keyboard scroll and scroll buttons reveal the last match; controls preserve
  focus as data changes. Score updates are announced without repeating all
  ten matches. Verify date boundaries and the October CET/CEST transition.
- Weather tests cover in-window forecasts, the actual last provider slot,
  120-hour/90-minute boundaries, missing key/venue/kickoff, neutral grounds,
  rescheduling, negative/zero temperatures, 0% rain, calm/missing wind, malformed
  provider responses, partial venue failures, cache coalescing, and rate of
  provider calls. Missing weather never hides or delays matches or results.
- Browser checks cover weather loading/unavailable states, readable icons and
  metrics in both themes, mobile wrapping, a live saved forecast with honest
  timestamps, clearing forecasts on identity changes, and the independent
  weather versus score refresh cadence. No production API is used in tests.

Run from `frontend/` after implementation:

```bash
bun run lint
bun run build
bun run test
bun run test:browser -- e2e/fixture-matches.spec.ts e2e/lineup-standings.spec.ts e2e/lineup-builder.spec.ts e2e/sticky-header.spec.ts
```

The weather extension includes an API route/schema change. After implementing
it, run the API coverage suite and regenerate both committed schema artifacts
from the repository root:

```bash
cd backend/api && uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80
```

```bash
uv run poe generate-openapi
uv run poe generate-endpoint-schemas
```

Commit `backend/api/openapi.json` and `docs/api/endpoint-schemas.md`; do not
hand-edit the generated schema documentation. These generation steps belong to
implementation; both artifacts have now been regenerated.

Suggested review sequence: calendar model/query reuse; shared weather service
and aggregate; panel/layout/weather; browser coverage and delivery
documentation. Planning deliverables are this proposal,
the editable preview, and the three mockup images above.

Planning QA, updated 20 October: three synthetic browser captures passed checks
for placement, horizontal scrolling to the final match, decoded crest images,
weather rows, out-of-window forecast messages, and absence of page overflow.
A fourth browser check verified state/theme/weather-availability switches at
320px, zero rain, calm wind, and saved kickoff forecasts. Preview JavaScript
syntax and local document links also passed checks. These checks validate the
proposal artifacts. Production verification is recorded below.

## Implementation record — 20 October 2026

Delivered the shadcn Card/ScrollArea/Badge panel before the lineup toolbar,
shared fixture queries, pure round selection, optional matchweek weather API,
shared provider cache, and the read-only `fantasy-calendar --weather` option.
The existing player-weather wire contract remains intact. API OpenAPI and the
endpoint schema document were generated from the new route and models.

The panel retains the active round between games and retains completed results
while loading/retrying the next schedule. This also works when `/calendar/current`
has already advanced before the new calendar response arrives. A reported
current round that has started takes priority over an older deferred fixture;
the selector checks at most the adjacent rounds, without scanning the season.
Ten distinct pairings and twenty distinct club IDs in finished state `7` are
required for completion. Scheduled state `1` never displays score placeholders.

Only states `1` and `7` could be independently verified in the current public
source. Other numeric states remain **Status unconfirmed**, with their reported
scores after kickoff, rather than receiving an invented live/postponed label.
They never establish completion. The Calendar guide records the public probe,
updated club IDs, stadium locations, and source links.

Weather failures remain independent of matches and lineup editing. Both failed
HTTP refreshes and HTTP-200 per-venue failures can retain a correctly identified
forecast, labeled unavailable/stale with its original retrieval time. Saved
pre-kickoff forecasts remain clearly labeled during play and are invalidated by
rescheduling or a venue override. Home/End and scroll buttons reach all matches;
updates preserve focus and scroll. A verified completed previous round stops
background polling. Visible match updates use 30-second polling; weather uses
30 minutes, and hidden tabs do not poll.

All twenty current clubs resolve to stadiums. The stale venue ID mapping was
corrected, Betis moved to La Cartuja, and the missing Elche/Málaga/Deportivo
entries were added from verified geographic data. The nearest-slot boundary
now strictly enforces the documented 90 minutes rather than accepting one
extra second. No provider key was added or exposed, no real Fantasy mutation
was performed, and all browser checks use fictional fixtures.

Implemented captures (fictional match/forecast data):

![Implemented fixture panel, light theme](images/screenshots/lineup-fixtures-light.png)

![Implemented active fixture with saved weather, dark theme](images/screenshots/lineup-fixtures-dark.png)

![Implemented mobile fixture panel](images/screenshots/lineup-fixtures-mobile.png)
