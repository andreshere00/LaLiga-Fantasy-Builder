# Frontend plan: LALIGA standings below Players Ranking

Status: implemented. Updated: 2026-10-14.
This document records the implemented design and verification requirements.

## Placement and behavior

Place **LALIGA standings immediately below the Players Ranking widget** in the
lineup screen's left column. Interpret “behind” as following it vertically in
the same column. Both widgets remain visible and have independent scrolling.
Headers, season, refresh action, and freshness copy remain outside their
scrolling bodies. A LALIGA club row does not select a Fantasy manager or change
the lineup.

Current integration points:

- `frontend/src/features/lineup/LineupPage.tsx`: `.column-players` renders
  `PlayersRankingPanel` followed by `LaligaStandingsPanel`.
- `LineupPage.css`: `.side-panel-scroll` already supplies vertical overflow;
  `.side-panel-modal` applies one full-height panel, which must be adapted for
  two panels sharing the sidebar. `lineup-layout.css` owns layout tokens.
- `frontend/src/api/client.ts`: `paths.competitionStandings()` explicitly uses
  `mode=completed`; `schemas.ts` registers the typed, validated response.
- `frontend/src/api/queries.ts`: existing TanStack Query and app JWT conventions.
- `frontend/src/components/ui/`: local shadcn Base UI Card, ScrollArea, Table,
  and Badge components, plus existing controls and wrappers.
- `frontend/src/styles/design-system.css`: already maps shadcn semantic tokens
  to the application's `--fb-*` palette, with light/dark themes and zero radius.

The frontend uses React 19, Vite, Base UI, and plain CSS. Add local components
from the shadcn Base UI patterns, adapting their styling to the existing CSS
system. No application-wide styling migration is needed for these two widgets.

Desktop composition:

```text
Left sidebar               Pitch             Squad
┌ Players Ranking ────┐
│ Scrollable managers │
└─────────────────────┘
┌ LALIGA standings ───┐
│ Season / freshness  │
│ Scrollable table    │
└─────────────────────┘
```

## Implementation specification

1. **Add the required shadcn UI components.** Add `Card.tsx`, `ScrollArea.tsx`,
   `Table.tsx`, and `Badge.tsx` under `frontend/src/components/ui/`, following
   the official shadcn Base UI component source and composition. Use Card,
   CardHeader, CardTitle, and CardContent for both widgets; ScrollArea and
   ScrollBar for their bodies; Table primitives for standings; and Badge for
   recent W/D/L outcomes. Implement the ScrollArea using the installed
   `@base-ui/react` primitives. Reuse the existing Button for refresh/retry.
   Preserve native table semantics and React 19 ref props. Translate source
   utility classes into scoped CSS, so the copied components work without
   introducing Tailwind. Retain component attribution where applicable.

   Style both cards with the existing square surfaces, thin borders, Anton
   headings, AT Aero body text, spacing tokens, and coral interaction accents.
   Use semantic theme variables for backgrounds, text, borders, focus, and
   status colors. Form badges use `--fb-success`, `--fb-warning`, and
   `--fb-failure` with readable foregrounds in both themes. Keep rank row
   density and the active manager's primary-color indicator.

   References: [Card](https://ui.shadcn.com/docs/components/base/card),
   [Scroll Area](https://ui.shadcn.com/docs/components/base/scroll-area),
   [Table](https://ui.shadcn.com/docs/components/base/table), and
   [Badge](https://ui.shadcn.com/docs/components/base/badge).

2. **Extract the existing ranking widget.** Create `PlayersRankingPanel.tsx`
   alongside lineup components. Keep the existing manager buttons, avatars,
   selection, disabled state, and `aria-current` behavior. Use the product label
   “Players Ranking” consistently without representing these rows as real
   football clubs. Pass `ranking`, `selectedTeamId`, and `onSelectTeam` as props.
   Keep state in `useLineupBoard`; extraction owns presentation. Wrap the
   existing semantic manager list in Card and ScrollArea.

3. **Use the dedicated standings query.**
   `useCompetitionStandingsQuery(competitionId, season, enabled)` is implemented in
   `api/queries.ts`. Key by
   `['competition-standings', userId, competitionId, season ?? 'current', 'completed']`;
   do not key by Fantasy league, manager selection, or fixture week. Enable after
   app login, pass the Query abort signal to `getJson`, and validate/select the
   `CompetitionStandingsDto`. Require both `staleTime` and `gcTime` to be at least
   `3_600_000` ms: successful data stays fresh for one hour and inactive data is
   retained for one hour after the widget unmounts. Navigation, focus, reconnect,
   and JWT rotation must reuse fresh data. JWTs do not appear in cache keys.
   Disable background/hidden-tab polling. After the hour, refresh on stale
   remount/focus/reconnect; an explicit user refresh can fetch earlier. Keep the
   cache in memory for the signed-in application session and clear it on logout
   or session expiration. A full page reload starts a new in-memory cache.
   Do not show or request a live mode until
   the backend supports it. Route a standings error to this panel only, so it
   cannot block the pitch or Fantasy manager ranking.

   Call the query inside `LaligaStandingsPanel`, mounted after
   `PlayersRankingPanel` in `LineupPage.tsx`. Use the existing application
   competition id convention (currently the query defaults to `1`) and omit
   season to let the server resolve the active season. The standings widget
   owns its query state; keep it out of `board.isLoading` and the lineup's error
   aggregation. Preserve the lineup route's current access gates.

4. **Build `LaligaStandingsPanel.tsx`.** Render the heading, current returned
   season, “Completed matches” label, freshness, refresh action, and a semantic
   shadcn Table with a caption and column headers. Initially use the active season;
   do not guess a list of supported historical seasons. Include the ten requested
   columns in their requested order, using the field mapping below. `played`
   remains available in the contract but is not an additional requested column.
   “Score” means league points, not a match score. Use stable
   real-club ids as row keys and server positions/order as authoritative.
   Show signed goal difference and zero values accurately. Render nullable badges
   with an existing media fallback. Club links need a real club destination before
   becoming interactive; do not reuse Fantasy manager selection handlers.

5. **Make both widget bodies scrollable.** In the desktop sidebar use a bounded
   grid with two `minmax(0, 1fr)` rows, a layout-token gap, and the existing sidebar
   height budget. Override full-height `.side-panel-modal` only inside this new
   composition. Set `min-height: 0` on grid children and flex bodies, put
   one shadcn ScrollArea viewport in each body, and keep headers outside. The LALIGA table
   needs a sensible minimum width and local `overflow-x: auto` to retain every
   column in the narrow sidebar; keep the club/position columns and header sticky
   within that scroll container. Remove the default Table wrapper overflow when
   it is inside ScrollArea, so the table has a single viewport for both axes.
   Use vertical ScrollBars for both widgets and a horizontal ScrollBar for the
   standings table. Give the viewports accessible names, keyboard focus, and
   visible focus styling; use the existing scrollbar palette. Keep the frozen
   team column compact enough to leave room for stats at narrow widths.
   Preserve each panel's scroll position across
   background refreshes and unrelated manager changes.

6. **Handle smaller layouts.** Preserve the current responsive board ordering.
   The two widgets remain sequential in the ranking column after the pitch/squad
   on stacked screens, with Players Ranking first. Give each body a bounded
   viewport-relative height (for example `clamp(240px, 45vh, 420px)`), rather than
   letting either expand to every row. Tables scroll horizontally within the
   widget and never widen the page. Allow the page to scroll normally when the
   panel reaches its boundary; do not trap mobile touch scrolling. At 200% zoom
   headers/actions wrap and all data stays accessible.

7. **Define form and data states.** Last-five outcomes are oldest-to-newest;
   use W/D/L text as well as color, with a visible Win/Draw/Loss legend and a
   “latest on the right” explanation. Each result has an accessible description
   with opponent, date, venue, and score. Match details must work on keyboard
   focus/tap, not hover alone. A zero-game club shows “No completed matches”.
   First load shows a fixed-height loading state; a first-load 503 shows
   “LALIGA standings are unavailable” with retry. A 502 indicates temporarily
   inconsistent source data and allows a later retry. A failed background fetch
   preserves the last successful table with a visible stale/error indication and
   last update time. Never replace a failed request with fabricated empty rows.
   `fetchedAt` and `sourceUpdatedAt` are different: show the provider timestamp
   when known, otherwise clearly label the retrieval time. Clear auth-scoped
   query data on logout using the existing auth/query lifecycle. Normal app JWT
   expiration follows existing app auth handling; this widget cannot request
   LaLiga pairing for a provider failure.

## Requested columns

| Requested information | Compact heading | Existing response field | Presentation |
|-----------------------|-----------------|-------------------------|--------------|
| Ranking | # | `position` | Server position, unchanged |
| Team | Team | `team` | Club name and badge with fallback |
| Score | Pts | `points` | League points, including adjustments |
| Matches won | W | `won` | Integer, including zero |
| Matches tied | D | `drawn` | Integer, including zero |
| Matches lost | L | `lost` | Integer, including zero |
| Goals scored | GF | `goalsFor` | Integer, including zero |
| Goals against | GA | `goalsAgainst` | Integer, including zero |
| Goals difference | GD | `goalDifference` | Positive sign, negative sign, or 0 |
| Last 5 matches | Last 5 | `last5Matches` | W/D/L badges, e.g. WWWLW |

Use full accessible column names for compact headers and tabular numerals for
numeric cells. Display exactly the available recent results when fewer than
five games have finished; do not fill missing games with draws or placeholders
that imply outcomes. Render the season as its returned start/end year, such as
2026/27, without inferring it from the browser date.

## Verification and delivery

Deliver in three stages: local shadcn components and ranking extraction;
standings panel and two-card layout integration; tests, browser verification,
and frontend documentation. The existing
API path helper and Python/auth/Zod response contract tests already cover the
transport layer; reuse `contracts/standings-response.json` for synthetic UI data.

Component tests cover all twenty rows and ten requested columns, zeros, signed
goal difference, missing badges, short/empty form, authoritative points, first load,
provider unavailability, invalid-contract errors, reuse after 59 minutes away,
refresh after the one-hour freshness boundary, user isolation, logout/expiration
cleanup, JWT rotation without cache loss, stale cached data after a
failed refresh, auth gating, cancellation, and manager selection unchanged.
Reuse the existing standings transport/cache/session tests for covered query
behavior; add integration coverage where rendering or mounting changes it.
Update `frontend/e2e/fixtures.ts` to match the competition standings route before
its broad `p.includes("/standing")` Fantasy-manager matcher, which otherwise
returns the wrong response for `/standings`. Add enough fictional managers to
force ranking overflow, plus the validated twenty-club standings fixture.
Use browser tests for actual overflow: wheel/touch and keyboard can reach the
last manager and the twentieth LALIGA club independently; headings remain visible;
horizontal table scrolling works; refresh preserves scroll/focus; no page-width
overflow in both themes at desktop, 390px mobile, the existing 375/800/1024/1440px
design-system sizes, and 200% zoom. Do not assert scrolling only
through CSS class names or JSDOM layout.

Run from `frontend/`: `bun run lint`, `bun run build`, `bun run test`, and
`bun run test:browser -- e2e/lineup-standings.spec.ts e2e/design-system.spec.ts`.
Update `docs/frontend.md` and the product screenshot gallery once the UI exists.
Completion means the real-club panel appears below Players Ranking, both panels
use local shadcn components and scroll independently, all ten requested fields
remain accessible, manager selection still works, and source failure does not
disable the lineup screen. This frontend integration requires no backend route
or schema changes.

## Delivery record

- Added the two panels, local shadcn primitives with MIT attribution, scoped
  theme styling, sticky table headings/club columns, and W/D/L match popovers.
- Reused the existing authenticated, validated, abortable one-hour standings
  query without changing its cache behavior or the backend contract.
- Added component coverage for all columns, adjusted points, zero/short/mixed
  form, missing images, first load, retry, invalid responses, failed background
  refresh, cancellation, cache reuse, and manager-selection behavior.
- Added browser checks for both themes at 375/800/1024/1440px, independent
  keyboard and wheel scrolling, horizontal scrolling without page overflow,
  sticky headings, selection and refresh preservation, isolated errors,
  keyboard/touch match details, and a 720×500 CSS-pixel viewport at device scale
  2 (the layout equivalent of 1440×1000 at 200% browser zoom).
- Updated the browser fixture matcher so real-club standings do not receive
  the Fantasy manager response. Captures in the frontend/product galleries
  use the shared synthetic contract fixture, not live provider data.

Validation completed on 2026-10-14: frontend lint and production build passed;
409 Vitest tests across 59 files passed; all 55 targeted Playwright standings
and design-system checks passed. Browser checks used the installed Chromium
via `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Live provider data was not required or
verified by these synthetic UI checks.
