# Frontend plan: LALIGA standings below Players Ranking

Status: planned UI; API transport, response contracts, and one-hour session query are implemented.

## Placement and behavior

Place **LALIGA standings immediately below the Players Ranking widget** in the
lineup screen's left column. Interpret “behind” as following it vertically in
the same column. Both widgets remain visible and have independent scrolling.
Headers, season, refresh action, and freshness copy remain outside their
scrolling bodies. A LALIGA club row does not select a Fantasy manager or change
the lineup.

Current integration points:

- `frontend/src/features/lineup/LineupPage.tsx`: `.column-players` currently
  renders a `Players` heading and `board.ranking` manager list.
- `LineupPage.css`: `.side-panel-scroll` already supplies vertical overflow;
  `.side-panel-modal` applies one full-height panel, which must be adapted for
  two panels sharing the sidebar. `lineup-layout.css` owns layout tokens.
- `frontend/src/api/client.ts`: `paths.competitionStandings()` explicitly uses
  `mode=completed`; `schemas.ts` registers the typed, validated response.
- `frontend/src/api/queries.ts`: existing TanStack Query and app JWT conventions.

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

## Implementation steps

1. **Extract the existing ranking widget.** Create `PlayersRankingPanel.tsx`
   alongside lineup components. Keep the existing manager buttons, avatars,
   selection, disabled state, and `aria-current` behavior. Use the product label
   “Players Ranking” consistently without representing these rows as real
   football clubs. Keep state in `useLineupBoard`; extraction owns presentation.

2. **Use the dedicated standings query.**
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

3. **Build `LaligaStandingsPanel.tsx`.** Render the heading, current returned
   season, “Completed matches” label, freshness, refresh action, and a semantic
   `<table>` with a caption and column headers. Initially use the active season;
   do not guess a list of supported historical seasons. Include all eleven
   requested data items: position, club, points, played, won, drawn, lost,
   goals for, goals against, goal difference, and last-five results. Use stable
   real-club ids as row keys and server positions/order as authoritative.
   Show signed goal difference and zero values accurately. Render nullable badges
   with an existing media fallback. Club links need a real club destination before
   becoming interactive; do not reuse Fantasy manager selection handlers.

4. **Make both widget bodies scrollable.** In the desktop sidebar use a bounded
   grid with two `minmax(0, 1fr)` rows, a layout-token gap, and the existing sidebar
   height budget. Override full-height `.side-panel-modal` only inside this new
   composition. Set `min-height: 0` on grid children and flex bodies, put
   `overflow-y: auto` on each body, and keep headers outside. The LALIGA table
   needs a sensible minimum width and local `overflow-x: auto` to retain every
   column in the narrow sidebar; keep the club/position columns and header sticky
   within that scroll container. Avoid double scroll containers for one table.
   Use `scrollbar-gutter: stable` where supported, visible focus styling, and the
   existing scrollbar palette. Preserve each panel's scroll position across
   background refreshes and unrelated manager changes.

5. **Handle smaller layouts.** Preserve the current responsive board ordering.
   The two widgets remain sequential in the ranking column after the pitch/squad
   on stacked screens, with Players Ranking first. Give each body a bounded
   viewport-relative height (for example `clamp(240px, 45vh, 420px)`), rather than
   letting either expand to every row. Tables scroll horizontally within the
   widget and never widen the page. Allow the page to scroll normally when the
   panel reaches its boundary; do not trap mobile touch scrolling. At 200% zoom
   headers/actions wrap and all data stays accessible.

6. **Define form and data states.** Last-five outcomes are oldest-to-newest;
   use W/D/L text as well as color. Each result has an accessible description
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

## Verification and delivery

Deliver in three commits: panel extraction/scroll layout; dedicated query and
standings panel; integration and accessibility/browser verification. The existing
API path helper and Python/auth/Zod response contract tests already cover the
transport layer; reuse `contracts/standings-response.json` for synthetic UI data.

Component/query tests cover all twenty rows and eleven fields, first load,
provider unavailability, invalid-contract errors, reuse after 59 minutes away,
refresh after the one-hour freshness boundary, user isolation, logout/expiration
cleanup, JWT rotation without cache loss, stale cached data after a
failed refresh, auth gating, cancellation, and manager selection unchanged.
Use browser tests for actual overflow: wheel/touch and keyboard can reach the
last manager and the twentieth LALIGA club independently; headings remain visible;
horizontal table scrolling works; refresh preserves scroll/focus; no page-width
overflow at desktop, 390px mobile, and 200% zoom. Do not assert scrolling only
through CSS class names or JSDOM layout.

Run frontend lint, TypeScript/build, Vitest, and the targeted Playwright cases.
Update `docs/frontend.md` and the product screenshot gallery once the UI exists.
Completion means the real-club panel appears below Players Ranking, both panels
scroll independently, all requested fields remain accessible, and source failure
does not disable the lineup screen.
