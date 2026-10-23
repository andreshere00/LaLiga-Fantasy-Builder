# Frontend

React app in `frontend/` (Vite, Bun). It is the browser entry point for
LaLiga Fantasy Builder: sign-in, league selection, lineup editing, player
catalog and profiles, and an interactive market board. It never calls LaLiga
directly and keeps the internal JWT in memory only.

- System map: [Architecture](architecture.md)
- HTTP routes the UI calls: [API overview](api/README.md)
- Completed visual migration: [Design-system migration record](frontend-design-system-migration-plan.md)

## Visual system and screenshots

The app uses Anton display headings, LALIGA Text body/actions, neutral square
surfaces, thin borders and coral primary actions. All buttons and button-styled
links have rectangular corners, enforced globally across pages and portaled
overlays. The header's **Dark/Light** control switches the whole document,
including portaled overlays and charts.
At widths up to 1000px, the main **Lineup / Market / Players** navigation is
fixed to the bottom of the viewport. It accounts for device safe areas, keeps
the active destination visible, and reserves space below the footer so content
is not covered. Branding and account options stay in the top header; desktop
navigation remains in the header.
Links never use text underlines, including on hover, focus, and visited states;
keyboard focus indicators remain visible.
Light is the default; an explicit preference is saved under `lfb-theme`.
LALIGA Text loads from the supplied WOFF2 face with a WOFF fallback. The shared
`--fb-font-body` token controls body text, forms, buttons, tooltips, and chart
labels. `--fb-font-size-body` scales the base size from 14px to 16px with viewport
width, while component type scales retain their existing priorities. These supplied files are static Regular faces; bold and italic emphasis
are synthesized by the browser. Width adaptation comes from responsive layout,
wrapping, and the existing type scale, rather than variable-font width axes.
The app uses Base UI for dialogs, selection, menus, tooltips, collapsibles and
toasts, with local CSS and native buttons/fields where appropriate.
The lineup sidebar uses local shadcn Base UI Card, ScrollArea, Table, and Badge
components, adapted to these same tokens and plain CSS.

Button guidelines apply throughout the application, including portaled dialogs:

- Command buttons have at least a 44 × 44 CSS-pixel target, visible keyboard
  focus, and rectangular corners. Radio/checkbox/switch primitives use their
  enclosing labels as the target. Table filters include the heading in the
  clickable area; dense performance controls retain full-size targets.
- Primary actions use coral with black text; secondary and cancellation actions
  use neutral surfaces or outlines. Dialog footers preserve these variants.
  Selected filters and pagination also use an underline, so color is not the
  only indication of selection.
- Disabled actions retain their appearance on hover. The shared `Button`
  suppresses activation when `aria-disabled` while remaining focusable for
  explanations. Pending mutations disable repeat submission, show a specific
  progress label, and expose `aria-busy`.
- Confirmation buttons name the effect: **Place bid**, **Send offer**,
  **Pay release clause**, **Withdraw player**, or the relevant squad action.
  Favorite toggles keep a stable accessible name and expose `aria-pressed`.

These conventions apply the skill's Fitts's Law and action-feedback guidance,
with [WAI button semantics](https://www.w3.org/WAI/ARIA/apg/patterns/button/).
They are implementation guidelines, not a claim of a full accessibility audit
or testing with representative users.

Shared shadcn-style field compositions keep the persistent label, constraints,
control, and correction together. Descriptions and errors are connected to their
inputs with stable IDs and `aria-describedby`; invalid amounts and date ranges
also expose `aria-invalid`. Bid limits stay visible next to the amount rather
than requiring people to remember them from another panel.

Dialogs can provide a concise accessible description and deliberate initial
focus. Bid dialogs focus the amount; clause payment and withdrawal start on
**Cancel**. A pending request marks the dialog busy and prevents Escape, backdrop,
or close-button dismissal until a result is available. Closing an idle dialog
restores focus to its originating control. Date-range editing still uses an
explicit Apply/Cancel workflow.

Automated browser checks and documentation screenshots use fictional,
deterministic account data. Screenshot assets live under
[`docs/images/screenshots/`](images/screenshots/). Keep updated screenshots and
their captions in the same commit.

### Product captures

All 23 captures were refreshed on 23 October 2026 (Europe/Madrid) from the current
React UI using mocked APIs. Player names, balances, offers, results, standings,
and forecasts are illustrative fixtures, not live account or provider values.
Player silhouettes are the application's normal fallback for these fictional
players. Desktop captures use a 1440 × 1000 CSS-pixel viewport (up to 2400 pixels tall for
expanded builder panels); mobile captures use
390 × 844. Component captures include the whole panel, and the full lineup image
includes content below the viewport. The gallery is also embedded in the
[project README](../README.md#screenshots).

#### Refreshing screenshots

From `frontend/`, install the browser once and regenerate the complete gallery:

```bash
bunx playwright install chromium
bun run screenshots:docs
```

The opt-in [capture suite](../frontend/e2e/docs-screenshots.spec.ts) writes the
existing 23 image paths. Normal browser tests skip this suite. It waits for fonts
and images, serves club badges from local fixtures, and blocks external traffic
through the shared browser fixtures. The fixture clock is fixed to 12 October
2026 so countdowns and dates remain repeatable. No live bids, trades, or lineup
saves are submitted. The final check produces a contact sheet in Playwright’s test output for visual
review. Review the resulting images and commit them with any caption updates.

#### Lineup

Light and dark overviews show centered lineup controls and a sample 4-3-3
starting XI. The full-page view includes the squad, manager ranking, matchweek
fixtures, and the full-width LALIGA standings at the bottom of the application.

![Current lineup and upcoming fixtures with weather, light theme](images/screenshots/lineup-current-light.jpg)

![Current lineup and upcoming fixtures with weather, dark theme](images/screenshots/lineup-current-dark.jpg)

![Full lineup page with the 4-3-3 pitch, squad, manager ranking, and LALIGA standings](images/screenshots/lineup-current-squad.jpg)

The builder groups player sources, trade permissions, optional player locks, and formations:

![Lineup builder player scope, trade permissions, and mandatory players](images/screenshots/lineup-builder-top.png)

Choose which player sources and trade recommendations the builder may consider.
Mandatory selections must appear in the starting XI; leaving formation
preferences empty permits all supported formations.

![Lineup builder mandatory players and formation preferences](images/screenshots/lineup-builder-options.png)

Results show recommendation notes and counts for **Only current squad** and
**Squad with external players**. Each recommendation includes a pitch preview,
player scores, and an expandable whole-squad projection with cash, squad size,
value, pending bid slots, deadlines, and the transaction plan. **Use as draft**
prepares local changes; building does not buy, sell, or save players.

![Lineup builder recommendation notes and result filters](images/screenshots/lineup-builder-results.png)

![Recommended 4-3-3 starting XI with individual player scores](images/screenshots/lineup-builder-pitch.png)

![Projected cash, retained squad, deadlines, and transaction plan](images/screenshots/lineup-builder-projection.png)

![Lineup player actions](images/screenshots/lineup-player-actions.png)

#### Market and player catalog

![Market board in dark mode with Offers, My bids, and available balance](images/screenshots/market-board.png)

![Hire player dialog with bid limits and amount controls](images/screenshots/market-hire-dialog.png)

![Market offers panel with amounts, expiry countdowns, and accept or reject actions](images/screenshots/market-offers.png)

![Players catalog in dark mode with form, release clauses, owners, and bookmarks](images/screenshots/players-catalog.png)

Bid management and responsive mobile layouts:

![My bids and projected spending](images/screenshots/market-bids.png)

![Market in dark mode on mobile](images/screenshots/market-mobile-dark.png)

![Mobile Players catalog, dark theme](images/screenshots/players-mobile-dark.png)

#### Player profile

![Demo player profile with availability, per-match averages, and Fantasy indicators](images/screenshots/player-profile-overview.png)

![Last-five performance chart with club badges, summary metrics, and fixture details](images/screenshots/player-fixture-stats.png)

![Latest player news and injury history with independent pagination](images/screenshots/player-fantasy-data.png)

![Previous and upcoming matches](images/screenshots/player-matches.png)

![Player market-value chart](images/screenshots/player-market-value.png)

![Per-match averages details](images/screenshots/player-averages-details.png)

## Running locally

Same-origin proxying matches production Nginx:

- `uv run poe dev` from the repo root (auth, API, scraping, and Vite), or
- `cd frontend && bun run dev:all` when backends are already up.

App URL: http://localhost:3000. `/auth`, `/laliga`, and `/api` proxy to auth
and the API.

## Routes

| Path | Screen | Primary API domains |
|------|--------|---------------------|
| `/` | Lineup — fixture matches/weather, formation, pitch, squad, manager ranking, club standings | [Leagues](api/leagues/README.md), [Teams](api/teams/README.md), [Calendar](api/calendar/README.md), [Standings](api/standings/README.md) |
| `/market` | Market — listings, bids, release clauses | [Market](api/market/README.md), [Buyout](api/buyout/README.md), [Players](api/players/README.md), [Calendar](api/calendar/README.md) |
| `/players` | Players — catalog, filters, top-10 leaderboard | [Players](api/players/README.md), [Calendar](api/calendar/README.md) |
| `/players/:playerId` | Player detail — stats aggregate | [Players](api/players/README.md) (`GET /players/{id}/stats/detail`) |

The shell header switches routes. The league dropdown applies to lineup, market, and players.

### Fixture matches and stadium weather

The lineup page ends with a full-width shadcn Card and horizontal ScrollArea,
below the lineup, squad, and standings.
It displays the current competition round from first play through the final
result, including gaps between matches, then changes to the next fixture's
pairings and kickoff dates/times. Ten distinct finished pairings are required
to establish completion. Until the next response is ready, the finished round
remains clearly labeled, retries automatically, and offers retry after a failure. At season end it says **Season
complete**. Historical lineup navigation and manager selection do not change
this competition panel or discard an unsaved draft. The panel has its own previous/next
fixture navigation, bounded to weeks 1–38. Browsing keeps the chosen fixture visible.
The horizontal scrollbar and previous/next fixture pager are the only navigation
controls. The pager is centered at phone widths. There is no manual refresh button.

Matches include club names/crests, Madrid-local dates and times, and reported
scores; scheduled score placeholders stay blank. Unrecognized provider match
statuses say **Status unconfirmed**, with any reported score, instead of an
invented live/final state. Incomplete round data cannot trigger advancement.
Automatic updates preserve scroll and focus; native horizontal scrolling, arrow keys,
and Home/End make every match reachable. Score-change
announcements are concise rather than repeating all matches on every poll.

Current metadata and fixture/score queries are shared with the lineup board and
refresh every 30 seconds while visible. The separate optional
`GET /api/calendar/weeks/{week}/weather` query refreshes every 30 minutes, with
source and original retrieval time shown. Hidden tabs do not poll; stale data
can refresh on focus/reconnect. Weather keys include fixture identities,
kickoffs, and venue overrides to invalidate rescheduled predictions.

Each match has a forecast summary that expands and collapses by click, Enter, or
Space. Details start collapsed and expand to their full height without internal
scrolling. Temperature and condition stay visible in the summary.
Weather shows condition/icon, °C, rain probability, and km/h when the server's
existing OpenWeather key is configured. Beyond the five-day provider window it
says **Forecast closer to kickoff**. Missing/failed weather never blocks games,
scores, or lineup editing. A forecast already received before kickoff may
remain during play as **Saved kickoff forecast**, with its original timestamp;
it is not observed current weather. Finished matches omit weather.

The [lineup gallery above](#lineup) includes the fixture panel. The expanded
forecast below uses deterministic weather data to demonstrate rain probability,
wind, and retrieval time:

![Expanded sample kickoff forecast with rain, wind, and retrieval time](images/screenshots/lineup-current-forecast.jpg)

See the [implementation record](frontend-fixture-panel-implementation-plan.md)
for behavior and validation details.

### Player detail widgets

The player detail screen loads recent and upcoming matches, profile data, and
weather from `GET /api/players/{id}/stats/detail`. Its match section shows up to
five cards in each direction, with a central score and labeled outcomes. Small
status rails distinguish results. Upcoming cards show a neutral weather icon and
available temperature, humidity, and wind values; unavailable forecasts leave
the fixture visible with a reason. A **View match timer** control shows the
countdown to a confirmed kickoff.

The **Form – fixture stats** section offers Last 5, Last 10, Last 20, Last 40,
Last 60, and **Show match statistics** views. A chronological bar chart puts
Fantasy points on a shared scale with an average reference line, including
negative scores and explicit zeroes. Total, average, and best scores summarize
the fixtures actually shown. Select a fixture to see its points, minutes, and
expandable event statistics, including DAZN points. The latest fixture is selected
initially; native radio controls support arrow keys, and the chart scrolls
horizontally for longer histories. The last five scores fit together on phones.
Home and away crests identify each fixture and the selected match; unavailable
images fall back to club initials, while full fixture names remain accessible.
Scores and the selected-match title lead the type hierarchy, with smaller club
labels, dates, and helper copy. Averages exclude missing
scores and label that scope. Missing points produce a labeled subtotal or
**Unavailable**, preserving the distinction from a genuine zero. The header's
**Fantasy outlook** leads with the starting estimate in large type and a
proportional meter, followed by the squad hierarchy, form, and injury risk.
One panel groups the four signals with thin dividers, neutral icon tiles and
compact labels; two columns on tablets and phones become one column on the
narrowest screens, keeping long labels readable.
The FutbolFantasy source is separate from the data. Explanations remain
available on hover and keyboard focus. Missing estimates show **Unavailable**
without a meter, while a reported zero remains **0%**.
**News & injuries** gives the news feed more space beside a compact injury
sidebar. The newest article has a larger headline; all headlines remain fully
readable, with source, publication date, and an external-link cue. Article links
announce that they open a new tab, while missing/invalid URLs remain plain text.
Injury records form a timeline with distinct current, ended, and unreported-end
labels, readable dates, and reported durations. Explicitly current records come
first, followed by the remaining records from newest to oldest; ongoing records
never present a future end date as a completed recovery. Both lists retain five
records per page with independent sliding three-number navigation and result
counts. Panels use their natural height and stack on phones and tablets.

The player header groups a compact portrait, club and position, player name,
availability and a separate Fantasy-points reading. Labeled player options and
favorite actions stay beside the identity on desktop and below it on phones.
Six equal metric cells occupy a full-width row below the identity, adapting to
three columns on tablets and two on phones. The **More averages** action sits
beside the section heading. The cells highlight position-specific averages; all
statistics open in a **More averages** performance dialog, keeping the profile
header compact. FutbolFantasy season averages take priority.
When a supported scraped metric is missing, the UI averages that metric across
played `lastStats` matchweeks from the LaLiga Fantasy catalog and identifies
that source and sample size. Form arrow classes map to **Bad**, **Mid**,
**Good**, and **Very good** labels; numeric form and starter probability are
shown when the source publishes them. A partial API failure is reported by
segment while successful groups remain visible, with **Retry player data** for
recovery. Failed match segments are distinguished from empty match lists.

The performance dialog groups event counts into Shooting, Chance creation,
Ball use, Defending, Discipline, and Goalkeeping. Each metric pairs its exact
mean with a definition, `/ match` unit, and source/sample label (shared in the
heading when a group uses the same source). Missing metrics
have their own disclosure and never become zero. The mean explanation identifies
these as counts per appearance, without per-90 normalization or a next-match
prediction. Shot and crossing breakdowns show approximate subset shares only
when both inputs come from the same FutbolFantasy season; mixed-source fallback
means, missing inputs, zero denominators, and inconsistent counts produce no share.
Other shot attempts include blocked attempts, so the remainder is not labeled
off-target. There are no invented player rankings or quality thresholds.

Definitions were researched on 22 October 2026 against
[Opta's event guide](https://www.statsperform.com/opta-event-definitions/) and
[LaLiga Fantasy's own rules](https://laligafantasy.zendesk.com/hc/es/articles/115002390453--C%C3%B3mo-se-calculan-los-puntos-de-mi-equipo).
The [mean definition](https://www.itl.nist.gov/div898/handbook/eda/section3/eda351.htm)
is consistent with the existing `averages_from_season` service and frontend fallback
calculation. Provider classifications are not assumed identical: the existing BR
mapping uses season `ballSteals` and fallback `ball_recovery`, while LaLiga's
assists without a goal remain separate from key passes. Source definitions and
calculation details remain available inside the dialog. No API contracts changed.

Section shortcuts link directly to keyboard-focusable headings for Overview,
Form, Market value, Matches, and News & injuries. Centered desktop shortcuts
stay beneath the app header and identify the current reading section with a
rectangular selection, a coral marker, and `aria-current="location"`.
The current section updates when scrolling, using links, or navigating history.
On phones, the shortcuts form a horizontally scrollable strip that flows
normally with the page; the active link scrolls into the strip's viewport
without moving page focus. Links retain native heading focus and URL hashes.
Phone profiles place the portrait beside the player's identity. This grouping
applies [proximity](https://lawsofux.com/law-of-proximity/) and
[chunking](https://lawsofux.com/chunking/) to the existing data and design system.

An unknown player ID (HTTP 404) or an invalid player link shows a focused
**Player not found** heading and **Browse players** action, with no profile,
bookmark, statistics, or section shortcuts. Temporary first-load failures have
a separate retryable state. A failed update retains previous results unless
the server confirms the player no longer exists.

Market value labels the current price, change, and actual date range returned by
the server. Previous results remain visible and explicitly labeled during a
period update or after a failed update; Retry uses the selected period. A
collapsed **View daily market values** table provides exact dates/prices alongside
the chart. Axis precision adapts to the price range, and an empty history keeps
the known current price visible. `e2e/player-detail-ux.spec.ts` checks keyboard
navigation, disclosures, missing points, period updates, and recovery using
fictional data in phone/dark and desktop/light layouts.

Player photos use available API media with fallback images from market listings
and the selected roster. Team crests resolve from fixture/catalog media and fit
inside fixed match-card tiles. Failed portrait and crest requests use safe
fallbacks. Custom value periods open a dialog with a keyboard-accessible
calendar, From/To fields and a Last days shortcut. Only **Apply range** updates
the query; Cancel leaves the current chart period intact.

### Lineup player actions

Pitch and squad cards show fixture points in the upper-left corner, opposite the
club crest. Clicking a populated card opens a player menu with **Market options**
and **Player details** (coaches have no details route). Market actions retain the
existing ownership, listing, balance and availability rules.

**Swap player** is available only for footballers in your editable lineup.
Choosing it on a pitch player opens the squad replacement picker. Choosing it on
a bench player asks you to select a pitch player in the same position. During
replacement selection, card clicks choose players directly. Changes remain a
local draft until you save the lineup; past and opponent lineups cannot be edited.

### Players screen

The Players table includes player photo, name, team, FSYP, form, market value,
owner, availability, position, and context-sensitive actions. Search and
column filters include a team list. Names are bold; known shields or future clause
locks make linked and plain coach names red, with keyboard-accessible protection
help. Lock expiry updates without a reload. Primary FSYP scores are bold at 16px;
the season average and score tooltip remain secondary. Form shows five matchweeks
in 26px squares, ordered oldest to newest, with earlier/later navigation.
Form filtering and score averages use the last three played matches, including
current-week matches once they start. Form badges also display scheduled current-week
matches as zero with a warning; these placeholders are excluded from averages.
The Players score tooltip appears only over the FSYP cell (or on keyboard focus). Row actions expose market options
when available, plus explicit player-name/details links. Favorite selection
changes only the bookmark icon; its surface stays neutral. Rich rows have thin
dividers without entrance motion. Filters edit a draft in a desktop side panel
or mobile bottom panel; Apply writes the existing URL state, while Cancel or
Escape discards edits. Catalog pagination uses a sliding three-number window.

At viewport widths of **800px or less**, the table condenses to the player
photo, name, team, and actions, with those four column headings shown.
The Name and Team filters remain available; other data columns and their filters
are hidden at that breakpoint. The loading state uses a table-shaped skeleton.

Market value also groups **Your bid** (red, only for a current bid) and **Release
clause**, including its shield and lock countdown. These details move into Actions
on small screens where Market value is hidden. Only listed players have a bid
count in Actions: known zero stays zero; missing or invalid counts show Unavailable.
Owned, unlisted players retain their roster clause; free agents show Not applicable,
while unknown clause/ownership data shows Unavailable. Known roster fields take
precedence over listings; missing fields may use a listing only when owner and
squad-entry identities match. Roster metadata does not depend on a manager name.
Existing league roster queries supply this data without requests per catalog row.

Players reuses the market's pending-bid reconciliation and square portaled bid
dialogs. Bid amounts and counts reconcile on create, modify, cancel and failed
mutations. League changes reset row/dialog state. Favorites, URL filters, pagination,
own-squad sale actions and player-specific Offers remain available; balance
projections and My bids stay on Market.

`e2e/players-market.spec.ts` covers these behaviors with synthetic league rosters,
including both themes at 375/800/1024/1440px and a 720px layout equivalent to 200%
zoom. Roster ownership and listing reconciliation have focused unit coverage in
`features/players/model/playerMarketDetails.test.ts`.

## Authentication

After Keycloak login, the app exchanges the session for an internal JWT
(`POST /auth/token` with CSRF) and sends `Authorization: Bearer …` on `/api`
requests. `needs_reauth` prompts the user to link LaLiga again. See
[Authentication](authentication/authentication.md).

## Shared building blocks

The application navigation stays at the top of the viewport when scrolling.
Market and Players titles stick immediately beneath it, using the measured header
height to follow responsive wrapping and auth notices. Menus and dialogs remain
above the sticky layers. Keyboard/anchor scrolling reserves space for both headers.

| Area | Location |
|------|----------|
| API paths and JSON helpers | `frontend/src/api/client.ts`, `format.ts`, `mappers.ts` |
| TanStack Query hooks | `frontend/src/api/queries.ts` |
| Dialogs and money display | `frontend/src/components/ui/Dialog.tsx`, `frontend/src/components/ValueBox.tsx` |
| Tooltip, pagination, notifications and controls | `frontend/src/components/ui/` |
| Theme roles and typography | `frontend/src/styles/design-system.css`, `fonts.css`, `theme.ts` |
| Live clock for countdowns | `frontend/src/hooks/useNow.ts` |

## Lineup screen

The user's current-fixture pitch provides two loading actions. **Load last saved
lineup** discards local edits and restores `GET /teams/{team_id}/lineup`.
**Load original lineup for FX** loads the fixture snapshot from
`GET /teams/{team_id}/lineup/week/{week}`, including its formation and captain.
The scoring action is enabled after the fixture starts and a snapshot is available;
an unavailable snapshot is never replaced by the latest saved lineup. Loading either
lineup changes the local draft only. Loading a different scoring snapshot enables
Save, which must be used explicitly to replace the saved lineup.

Code: `frontend/src/features/lineup/`.

- **Lineup builder** requests up to seven recommendations total. The filters
  **Only current squad** and **Squad with external players** narrow that same list.
  Switching filters preserves original ranks and does not rebuild or execute trades.
  Acquisition lineups must score strictly higher than the strongest feasible
  current-squad lineup; fewer than seven total may qualify. If the current squad cannot
  form a valid XI, acquisitions can still complete one.
- **Players Ranking** lists the user and opponents; **LALIGA standings** sits
  immediately below it. Each card has an independently scrollable body and a
  fixed heading. On desktop they share the existing sidebar height; on stacked
  screens they follow the pitch and squad with bounded scrollable bodies.
- The LALIGA table includes rank, team, points, wins, draws, losses, goals for,
  goals against, signed goal difference, and last-five results. Horizontal
  scrolling reveals every statistic while rank/team and the table header stay
  visible. W/D/L badges run oldest to newest; click, tap, or activate a badge by
  keyboard for opponent, venue, score, and date. Club rows do not select managers.
- The widget uses `GET /api/competitions/1/standings?mode=completed` through
  `useCompetitionStandingsQuery`, resolving the current season on the server.
  Its in-memory query is fresh for one hour and retained for one hour after
  unmounting; logout/session expiration clears the user-scoped cache. The
  refresh button can request data earlier. Source-update and retrieval times
  are labeled separately. Provider failures offer retry inside the widget,
  preserve any previous table, and do not block the lineup. See the
  [standings implementation record](frontend-standings-implementation-plan.md).
  The default `laliga-fixtures` source computes scores and form from completed
  public fixtures and verifies the table against the private official scraper.
  The optional API-Football source's `standings_plan_unavailable` response explains that the provider does
  not cover this season; the server's configured provider key needs season
  access before retry can succeed.
- Loads leagues, remembers selection, and supports `/?team={teamId}` to open
  another manager’s squad when that team appears in standings.
- Matchweek navigation, formation picker, lineup save (`PUT /teams/{team_id}/lineup`,
  full replace — [Teams API](api/teams/README.md)), standings, pitch, and
  paginated squad panel.
- Shared player tiles and score badges are reused on the market table.
- On your own squad, hover a player for **Click for player options**, then click the
  card. **Bring to market** lists the player (`POST /api/market/leagues/{id}/listings`)
  for a whole-euro offer from the current market value through 999.999.999 €.
  When that player is already listed, **Bring to market** is replaced by **Cancel bid**
  (`DELETE /api/market/leagues/{id}/{marketId}`) and **Modify bid** (withdraw, then list
  again at the new amount). **Send immediately to market**
  (`POST /api/market/leagues/{id}/immediate-sales`) sells at half the market value;
  Fantasy credits the balance and the player leaves the squad. These actions are hidden
  while you are replacing a pitch player, and on another manager’s squad.

## Market screen

Code: `frontend/src/features/market/` (`model/`, `cells/`, `actions/`,
`MarketPage.tsx`, `useMarketBoard.ts`). Row helpers are re-exported from
`marketRows.ts`.

### Toolbar

- **Amount available** groups the reported balance from
  `GET /api/teams/{team_id}/money` (league object fallback) with a chevron that opens
  the two projection rows in a popover. The closed balance control has the same
  height as Offers and My bids, aligned to the toolbar's right edge; search stays
  on the left. The estimate explanation is available from the popover's information
  button on hover or keyboard focus. Escape or clicking outside closes the details.
- **Projected spending** sums distinct active bids across the selected league,
  including supplemental `userBids` whose players are absent from the table. Filters
  never change commitments. The assumption is that **all active bids succeed**.
- **Estimated available** is the conservative `reported balance - projected spending`.
  Gross versus net reservation accounting remains unverified; this can understate
  available cash if Fantasy already reserves bids. Sales, offers and the 20% squad
  borrowing allowance are excluded. Missing balance, missing/conflicting amounts or
  unclassifiable bids show unavailable/incomplete projections. Negative projected
  cash has its own explanation, separate from the reported-balance warning.
- **My bids** beside Offers shows the active count and opens a side/bottom sheet.
  It lists player, amount, seller, time remaining/status and eligible Modify/Cancel
  actions, sorted by nearest known expiry with unknown expiries last. Missing display
  metadata uses explicit fallback labels without discarding a known commitment.
  Only confirmed pending bids with authoritative bid/listing identifiers can be
  modified/cancelled; synthetic local bids and invalid expirations cannot send writes.
  The sheet closes fully before opening Modify, and dismissal restores focus to its
  trigger. Cancel moves focus off the removed row. League changes reset sheets,
  dialogs and filters. Refresh uses the existing market and money queries; cached
  rows remain visible and marked stale on failed background reads. First-load,
  incomplete-data and empty states are distinct.
- Negative balance shows a warning icon and red amount. Its balance-details
  popover explains that cash must be positive before the next matchday to score.
- **Offers** beside the market balance opens a modal side panel (bottom panel on mobile),
  following the shadcn Sheet pattern on the existing Base UI dialog. Its translucent
  backdrop leaves the market visible. The supplied notification icons adapt to the
  theme and pending count. Offers load asynchronously when the market screen appears;
  they never block the market table. The entire notification button turns red as soon
  as a pending offer arrives, even while other offer reads are still loading, and
  returns to its normal appearance when none remain. Close, Escape and backdrop dismissal restore focus to
  the trigger; dismissal is blocked while an offer response is being sent.
- Your own players have **View offers for this player** in their Options menus
  on the lineup, Players, and market screens. It opens the panel filtered to that
  player's incoming offers; the market toolbar notification count covers the full squad.
- The panel reads `/api/market/leagues/{id}/player-teams/{playerTeamId}/offers`
  for the caller's squad, independently of market filters and listings. Reads are
  cached for 30 seconds, refreshed on opening and manually, and polled every minute
  while open. Partial failures preserve available offers and mark the count incomplete.
  `isFromMarket: true` identifies LaLiga offers. Missing sender data without that
  flag is not assumed to mean LaLiga. Bids remain visible but cannot
  be answered through offer endpoints.
- Pending offers with valid identifiers and whole-euro amounts can be rejected or
  accepted. Acceptance confirms the player, sender and exact amount before sending
  `offerMoney`; expired offers are excluded. Changed amounts and unknown statuses
  block confirmation. Writes are never automatically retried. Confirmed responses
  update the count and refresh market, offers, squad, lineup, balance and leagues;
  unusable success responses refresh reads so the user can check the outcome.
- Each offer displays a clock and time remaining, refreshed every minute, alongside
  its exact expiry date. The clock turns red at one hour or less. Expiries below
  one minute show `<1m`; absent or invalid dates show an unavailable indicator.
- **Search and filters** (`marketFilters.ts`, column header filter icons): toolbar
  `query` matches player, seller and team; column editors use separate `player`
  and `seller` strings (AND with `query`). Each filterable table column has a funnel
  icon that opens min/max or text controls (market value 1.000–1.000.000 €,
  whole-number points/form). **Clear filters** in the toolbar resets everything;
  **Clear column filter** resets only that column. Filter state stays on the page
  across refetches; values use `useDeferredValue`. Column filters open a
  responsive side/bottom dialog with local draft values. **Apply filters**
  commits the draft; Cancel, Escape and backdrop dismissal discard it.
  **Clear column filter** clears that field in the draft; Apply confirms it.
  Market and Players share the same flat rich-row presentation.

### Data loading (`useMarketBoard`)

| # | Request | Purpose |
|---|---------|---------|
| 1 | `GET /api/market/leagues/{league_id}` | Listings and `userBids` ([Market snapshot](api/market/README.md)) |
| 2 | `GET /api/players` | Catalog (names, photos, positions) |
| 3 | `GET /api/calendar/current` | Current and previous matchweek for form |
| 4 | `GET /api/players/{id}/market-value` | Per listed master id (trend + tooltips) |
| 5 | `GET /api/calendar/weeks/{week}/stats` | Played history plus current matchweek scores for form badges |
| 6 | `GET /api/teams/{team_id}` | Caller squad size and squad value (eligibility) |
| 7 | `GET /api/teams/{team_id}` (seller teams) | Opponent rosters when buyout lock times are missing on listings |

After bid mutations, the client refetches market, money, and squad data. A
short-lived **pending-bid overlay** reapplies local bid/cancel state on top of
stale snapshots until Fantasy confirms the change (`model/pendingBids.ts`).
The same normalized collection (`model/activeBids.ts`) drives table bid state,
My bids, spending and squad-cap checks. Distinct real ids deduplicate listing and
envelope copies; local ids reconcile by listing identity. Terminal/expired bids
are excluded; unknown statuses remain visible and prevent a complete projection.
Known `numberOfBids` changes once on create/cancel and stays unchanged on modify;
unknown counts remain unknown. Failed cancellations discard the overlay and
reconcile with server data. Direct offers do not create synthetic market bids.
Projections stay marked refreshing while either read or a pending confirmation is
outstanding; follow-up reads refresh both market and money without adjusting cash
locally.

Reservation evidence reviewed on 2026-10-18: the captured market fixture
(`backend/api/tests/fixtures/market_captured_snapshot.json`) contains one pending
listing bid for €12,500,000, but has no corresponding money read or league-summary
cash. `assets/fantasy_market-json-tree.json` records pending-bid fields;
`assets/fantasy_leagues-json-tree.json` and `assets/leagues_info_structure.json`
describe money fields without paired amounts/timestamps. They cannot establish
whether reported cash already includes reservations. No transaction was created
to obtain evidence, and `teamInvestment` is not treated as pending spending.
Future verified gross accounting uses `B - P`; verified net accounting uses `B`.

### Table columns

| Column | Notes |
|--------|--------|
| Player | Photo and bold name/link; bid icon and amount tooltip when you have a bid. Shielded or future clause-locked names are red and bold, with textual protection help; expired locks revert unless shielding remains |
| Position | Abbrev badge (`GKP`, `DEF`, `MDF`, `ATK`, `COA`); hover shows full role name |
| FSYP | Bold 16px primary points plus secondary season average; hover panel: total, season average, form (last 3) |
| Form | Five matchweeks at a time, oldest→newest, in compact 26px score squares; current pending fixtures show 0 with a warning and are excluded from averages; ‹ earlier, › later (full season) |
| Market value | Price, 5-day change, your active bid amount when present, then release clause with protection and lock countdown; hover on the price: last, highest, lowest, 5d/14d ago with % vs current |
| Availability | SVG icons + hover text for next matchday readiness |
| Seal end | Countdown with a coral status rail when under one hour remains |
| Sell options | Seller link (`/?team=…`) or `LALIGA`; **Options** / **Bidded** action menu. On your own listings the menu offers **Withdraw from market** (confirmation modal, `DELETE /api/market/leagues/{id}/{marketId}`) and a disabled **Immediate sell** entry until a documented Fantasy route exists |

The player name occupies a single compact grid track beside the photo, wrapping
long names. Table headers and loading placeholders use the same column layout.

The seller/options cell also displays **Bids: 0** for a known zero count and
**Bids: Unavailable** for missing/invalid counts; `numberOfOffers` is never added.
Below the market value, **Release clause** shows the known positive euro value even while protected,
Not applicable for a LaLiga listing without a clause, and Unavailable for other
unknown values. The shield beside it follows the theme foreground (white in dark
mode); the separate red protection icon stays red. The clause lock countdown stays
with the clause value. Seller navigation remains in Sell options. Market value
and clause details remain reachable by scrolling the table horizontally on smaller
screens. Bid/direct-offer
dialog actions, close and counter buttons have square corners, including disabled
controls. Market and Players share typography, protection and score styling while
keeping their own responsive column layouts.

### Actions (user-confirmed only)

Each row’s menu depends on listing type and your bid state. Dialogs use grouped
euro amounts (es-ES). CLIs and browser-session flows stay read-only.

| Action | When | API |
|--------|------|-----|
| **Hire** | LaLiga listing, no active bid | `POST …/bids` |
| **Purchase bid** | Opponent listing | `POST …/bids` or `POST …/direct-offers` when `directOffer` |
| **Modify bid** / **Cancel bid** | You already bid | `PUT` / `DELETE …/bids/{bid_id}` |
| **Pay release clause** | Opponent, clause unlocked, balance OK | [Buyout pay](api/buyout/README.md) |

**Eligibility (client-side before dialogs):**

- Squad cap: fewer than 24 players and `players + active bids < 24` for new bids.
- Bids: amount ≥ market value and ≤ cash + 20% of squad market value,
  regardless of whether the starting cash is positive, zero or negative.
  The exact limit is allowed. Modifying a bid restores that bid's reserved amount
  before calculating the limit. Unknown squad valuation grants no debt allowance.
- Coaches (`positionId` 5): **Hire** disabled; menu shows the premium-only explanation
  (`marketMessages.ts`).

**Explanations on disabled menu items:**

- Locked release clause: cannot activate yet + countdown until unlock (from
  listing or seller roster `buyoutClauseLockedEndTime`).
- Coach hire: LaLiga Fantasy premium subscribers only.

**Bidded UX:** neutral **Bidded** trigger with bid icon, **Modify bid** and
**Cancel bid** actions; bid amount tooltips on name and button.

**Errors:** upstream bid `400` / `fantasy_error` maps to a refresh-and-retry
message when listing state changed (`marketActionErrors.ts`).

User-facing copy constants: `marketMessages.ts`, `marketActionErrors.ts`,
`bidTooltip.ts`.

### Tests

`frontend/src/features/market/**/*.test.ts` and `*.test.tsx`, plus
`api/format.test.ts` and `client.test.ts` for shared helpers.
`e2e/market-bids.spec.ts` covers fixture-only commitments/mutations, stale reads,
league isolation, focus, both themes at 375/800/1024/1440px and a 720px layout
equivalent to a 1440px display at 200% zoom, plus a Players regression check.

Current-matchweek scores are loaded for both your lineup and opponents' lineups,
including pitch and squad badges. The current calendar score takes precedence over
cached player history. Current-week stats refresh every 30 seconds while the screen
is open. Before a match is played, its displayed zero is a placeholder, not a played
result for form averages.

## Validation

From `frontend/`:

```bash
bun run lint
bun run test
bun run build
bunx playwright install chromium
bun run test:browser
```

Browser tests run an isolated Vite server on port 3100. They intercept auth/API
requests with fictional fixtures and block external requests; no live bids,
sales or clause payments are performed. The suite covers both themes at
375/800/1024/1440px, the catalog's 800/801px boundary, access gates, supporting
routes, filter focus/cancellation, calendar apply/cancel, and confirmed-response
notification timing. Screenshot artifacts go to `frontend/test-results/` by
default; `PLAYWRIGHT_OUTPUT_DIR` can override the location.

Club and competition badges use the shared candidate loader with published API,
catalog/scraped, and verified local football-logos.cc fallbacks. Source manifests,
refresh instructions and attribution are documented in
[badge sources](frontend-club-crest-sources.md).

Builder setup groups player sources into selectable tiles, separates optional
trade recommendations, and keeps Build/Close outside the scrolling content.
Mandatory player search expands on demand, with a persistent selection count;
formations remain visible as individual checkboxes. Trading-only purchases are
shown when purchase recommendations are enabled. Empty source selection explains
why Build is unavailable. These controls retain their configuration while users
explore options and generated previews.

LaLiga standings sit below the lineup, squad, manager rankings and fixture
schedule as a full-width section. Desktop can show all table columns together;
mobile retains horizontal scrolling with pinned team identities. The bounded
vertical table area keeps its heading, refresh action and column headers nearby.

The market uses compact comparison rows on desktop and labeled player cards at
700px and below. Phone cards keep points, form history, market value, availability,
expiry and seller actions visible; column filters remain in a horizontally
scrollable strip. The result count reflects the active filters. Season averages
are labeled explicitly, and LaLiga listings omit the inapplicable release-clause
line. Transaction dialogs and confirmations retain their existing behavior.

Players and Market share `ComparisonList.css` for typography, portrait sizing,
form controls and comparison-row styling. Players keeps club, ownership and
favorite actions alongside the shared facts. At phone widths, both screens use
labeled cards; Players shows value and clause details together in the value
section, without duplicating them under Actions. Tablet retains all catalog
columns through horizontal scrolling. Filtered counts and pagination distinguish
the visible page from the full matching set.
