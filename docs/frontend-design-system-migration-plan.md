# Frontend design-system migration plan

Status: implemented on 2026-10-12 in the nine commit stages below.

The original plan is retained as the implementation record. See the completion
record at the end for validation results and implementation decisions.

Adapt the existing frontend to `output/design-system` through independently
reviewable, buildable commits. After shared foundations, organize changes by
screen, including the controls, overlays, loading states and errors belonging
to that screen. Keep the application usable between commits.

## Design references and baseline implementation

Use these local artifacts as the source of truth, in this order:

1. [Component style guide](../output/design-system/component-style-guide.md),
   including its final preview refinements and accessibility rules.
2. [Widget reformat notes](../output/design-system/widget-reformat-notes.md)
   for screen composition and the ten widget proposals.
3. [Widget examples](../output/design-system/widget-reformat-examples.html)
   and [component preview](../output/design-system/component-preview.html)
   for appearance in both themes. Their data and portrait placeholders are
   examples, not content to copy into the application.
4. [Reference CSS](../output/design-system/design-system.css),
   [component inventory](../output/design-system/components.json), and the
   reference implementations of
   [Button](../output/design-system/code/Button.tsx),
   [NumberPagination](../output/design-system/code/NumberPagination.tsx) and
   [PulseRing](../output/design-system/code/PulseRing.tsx).

Before migration, the frontend used React 19, Vite, React Router, TanStack Query,
Motion and Recharts, with feature CSS and native/custom controls. It had no
shadcn/Base UI dependency or Tailwind setup. The reference is an adaptation
specification, not a drop-in replacement stylesheet.

Dependencies identified at planning time:

- `PlayersPage.tsx` imports `MarketPage.css`, market cells, search, row motion,
  action menus/dialogs and `PlayerTile`. Changing market CSS globally would
  also change Players before its migration commit.
- `PlayerTile`, `SquadPlayerActions`, `NumericCounterField`, market dialogs
  and manual tooltip styles have consumers on several screens. Some market
  CSS even targets pitch controls.
- `Modal` portals to `document.body` and manages background inertness and
  focus restoration. Route-scoped styling alone cannot theme its content.
- Player Detail owns summary, form and chart markup inside one large page;
  match and fantasy panels already have separate components. Its loading
  styles share a file with the Players catalog loader.
- The actual route inventory also includes `/contact`, the not-found screen,
  auth gates and the application error boundary. These need migration even
  though they are not illustrated in the widget examples.
- `output/` was untracked at planning time. Before implementation, selectively track
  the design inputs used for acceptance so later commits can reproduce the
  reference. Avoid a blanket add of unrelated output artifacts.

## Visual contract

| Area | Required result |
|------|-----------------|
| Typography | Actual Anton 400 for uppercase display headings, +0.03em tracking; AT Aero 400/500/600 for body, labels and actions. Add the supplied Anton and Semibold assets; do not synthesize missing weights. |
| Color | Semantic light/dark roles from the guide. Coral `#FF4B44` for primary actions and active rules; neutral surfaces/text; cyan and purple used sparingly. Black foreground on coral primary actions. |
| Geometry | Square panels, tables, inputs, navigation and integrated controls; 8px radius only on standalone action buttons. Preserve explicit circular loader exceptions. |
| Structure | Opaque surfaces and thin neutral borders; no gradients, shadows, glow or blur. |
| Motion | 160ms color transitions; restrained panel translation at most 200ms; remove spring entrances, scale pops and hover lifts. Pulse Ring follows its separate reference timing. Respect reduced motion. |
| Controls | Touch targets at least 44px; visible 2px focus outline; selects with one 18px chevron inset 12px. Favorites change only the bookmark icon, keeping surface/border neutral. |
| Overlays | Consistent Base UI primitive family and `render` composition; Dialog/Drawer for dates and rich details, Sheet/Drawer for filters. No generic Popover component. |
| Lists | Flat rich rows, aligned values and status labels; explicit player links and separate action controls. Three-number sliding pagination where specified. |
| Feedback | Pulse Ring for initial/full-panel loading; flat skeleton pulse for predictable regions. Distinguish pending, disabled, empty, degraded and failed states. Toasts follow confirmed mutation results. |

This is a presentation migration. Preserve API contracts, query keys,
authentication, league selection, eligibility checks, player identifiers,
favorite storage, draft state and mutation sequencing. Retain real media and
all existing data; introduce no fabricated fixture, value, weather or profile
data. The disabled Build lineup action stays disabled.

The briefing deliberately changes a few interactions: whole-row Players
navigation becomes explicit links, filters gain an Apply/Cancel workflow,
custom dates move into a dialog, and history paging becomes numeric. These
changes belong to the relevant screen commit and need behavior verification.
Do not add unrelated product features such as favorite notifications.

## Staging and shared-component boundaries

1. Add new semantic tokens and component styles alongside legacy tokens.
   Keep old token values and unmigrated selectors stable until their final
   consumer migrates. Do not replace global `--white`, `--gray`, typography
   or shadow values at the start.
2. Put reusable presentation primitives in `frontend/src/components/ui/`
   and adapted CSS in `frontend/src/styles/design-system.css`. Use the
   existing CSS architecture; introducing Base UI does not require converting
   every feature to utility classes. Verify the current official Base UI and
   shadcn documentation before generating/installing primitives. Use Bun and
   update `frontend/bun.lock`: both CI and the frontend Docker build use
   `bun install --frozen-lockfile`. Keep the existing npm lockfile consistent
   if the documented npm installation path remains supported.
3. Adapt the native Button/PulseRing/NumberPagination references where suitable.
   Generate/install complex primitives only as consumers need them. The
   28-item gallery is a vocabulary, not a requirement to ship unused controls.
   Prefer Native Select for simple fixed choices; use Combobox for actual
   search requirements. Do not mix Radix-only attributes or composition APIs.
4. Opt screens into new styles explicitly. Shared components can temporarily
   accept an `appearance="design-system"` presentation option, defaulting to
   legacy for remaining callers. Apply this only where cross-screen reuse
   requires it; avoid duplicate data hooks or duplicated feature logic.
5. Extract genuinely shared rich-list/control styles from `MarketPage.css`
   into a dedicated shared stylesheet without altering legacy appearance.
   Keep market-only rules scoped to Market, including during lazy-route loads.
   Keep the existing labeled-list semantics for rich rows during this
   migration; ordinary statistical tables remain semantic tables. Do not
   introduce sorting behavior that does not already exist.
6. Define theme variables on the document root and explicitly style new portal
   content. Keep light as the user-facing theme during partial migration;
   review new components/screens in dark mode using fixtures or a QA theme
   override. Expose the production theme control only after every screen and
   portal supports dark mode. Do not ship a partly dark application.
7. Migrate loaders, errors, filters, tooltips and confirmations with their
   owning screen. Shared primitives can be added in an earlier commit, but
   the screen must not depend on a later commit to finish its normal flow.
8. Use additive presentation changes so a screen commit can be reverted while
   foundations remain. Revert dependent commits first if needed; remove
   compatibility paths only after the last consumer has migrated.

## Commit sequence

Implement sequentially. Each row is a proposed Git commit, including relevant
documentation and validation evidence. Do not create a single final commit
containing all screens.

| ID | Suggested commit subject | Complete review surface | Depends on |
|----|--------------------------|-------------------------|------------|
| 01 | `feat(frontend): add scoped design-system foundations` | Fonts, tokens, core primitives, shared-style isolation; existing screens remain usable | Design reference baseline |
| 02 | `feat(frontend): restyle shell and access screens` | Header, footer, auth gates, contact, not-found, app error and route fallback | 01 |
| 03 | `feat(frontend): migrate lineup screen styling` | Command bar, standings, pitch, squad, own/opponent states and lineup overlays | 02 |
| 04 | `feat(frontend): migrate market screen styling` | Search/balance, rich rows, filters, action menu and deal dialogs | 03 |
| 05 | `feat(frontend): migrate players catalog styling` | Search/team filter, leaderboard/catalog rows, favorites and numeric pagination | 04 |
| 06 | `feat(frontend): migrate player detail summary and form` | Identity, averages, form cards, breadcrumb, detail loading and segment feedback | 05 |
| 07 | `feat(frontend): migrate player value and match panels` | Theme-aware chart, date dialog, previous/upcoming matches, countdown and weather | 06 |
| 08 | `feat(frontend): migrate player fantasy and history panels` | Fantasy profile, dated news and injury timeline with independent numeric paging | 07 |
| 09 | `refactor(frontend): finish theme rollout and remove legacy styles` | Both themes throughout the app, no migration adapters, final documentation/screenshots | 08 |

Player Detail uses three commits because it contains several substantial
panels. Each changes a complete visible region of the same screen, leaves the
remaining regions working, and passes the screen's data/error contract checks.
If a whole-screen commit is preferred, squash 06–08 only; keep the other screen
boundaries intact.

### 01 — Shared foundations and isolation

**Files:** `src/styles/{tokens,fonts,global}.css`, new
`src/styles/design-system.css`, `src/assets/fonts/`, new `src/components/ui/`,
`src/main.tsx`, `package.json` and `bun.lock` (plus `package-lock.json` while
supporting npm). Make narrowly scoped
extractions in `MarketPage.css` and its importers where needed for isolation.

- Copy the real Anton 400 and AT Aero Semibold 600 files into frontend assets.
  Keep existing italic/bold assets for current consumers.
- Add light/dark semantic tokens, heading/body/label roles, spacing, borders,
  button radius, focus and motion rules from the guide. Adapt the reference
  CSS; exclude its preview-only layout and blanket global overrides.
- Add Button, Input/InputGroup, NativeSelect, PulseRing, flat Skeleton and
  NumberPagination. Prepare the shared Dialog and Tooltip presentation using
  the specified primitive family, leaving existing `Modal` callers intact.
- Isolate shared list styles from market-only page styles. Preserve the
  legacy selector behavior until screens explicitly opt in.
- Record the tracked reference files and a baseline screenshot/state inventory.
  Capture initial bundle size for comparison when complex primitives arrive.

**Acceptance:** all existing routes retain their current behavior and light
appearance; fonts resolve locally; new controls demonstrate both themes,
keyboard focus and reduced motion. Pagination reaches every page in a list
longer than three pages, handles fewer than three pages, clamps after shrink,
and preserves focus as the numeric window changes. No global CSS reset changes
unmigrated screens.

### 02 — Shell, access and supporting screens

**Files:** `features/shell/{Header,Footer}.*`, `ProfilePhoto.tsx`,
`features/gates/GatePanel.*`, `app/{App,ContactPage,NotFoundPage,AppErrorBoundary}`
and their styles; shared primitives only as required.

- Replace the tall banner with a compact wordmark and three flat route links.
  Use a coral active rule; keep account and league controls distinct from
  primary navigation. Retain responsive access to every destination.
- Use a selection primitive for league choice and a purpose-specific
  Dialog/Sheet for profile information, replacing manual generic panels.
  Retain selection, Escape, keyboard movement and focus restoration.
- Flatten the footer and preserve its contact/GitHub links.
- Apply square panels, Anton headings and consistent actions to signed-out,
  linking, reauthentication, unavailable, contact, not-found and app-error
  states. Replace session and lazy Player Detail loading with Pulse Ring.
- Wire shared overlay/notification providers if required. Leave feature
  mutation notifications to their owning screen commits.

**Acceptance:** login/logout, league switching and all existing routes work;
Header tests pass; responsive navigation does not conceal links; gate retry
and connect actions still use existing auth flows. Global canvas changes are
checked against every still-legacy screen. The production theme remains light.

### 03 — Lineup screen

**Files:** `features/lineup/LineupPage.*`, `lineup-layout.css`, `PlayerTile.*`,
`PitchMotion.tsx`, `TeamValueBox.tsx`, `SquadPlayerActions.*`,
`LineupMarketOptions.tsx`, lineup tooltip/notice components;
`components/ValueBox.*` and `NumericCounterField.*` as opt-in presentation.

- Group fixture paging, score and formation in one square command panel.
  Save is the primary standalone action; team value is a neutral number.
- Flatten ranking rows with a coral selected rule. Keep the pitch recognizable
  with neutral markings; adapt the existing SVG or render its markings with
  theme tokens. Do not change formation positioning calculations.
- Use square portrait/name regions and compact labeled point/status marks.
  Make pitch and squad controls legible and reachable on small screens;
  ranking and squad stack below the pitch as in the briefing.
- Remove pitch spring/scale/hover-lift motion. Migrate player menus, sale
  dialogs, lineup market-options dialogs and short tooltips, including any
  reused market confirmation reached from this screen.
- Include initial/squad loading, no league, read-only/opponent/past fixtures,
  disabled Save explanations and save failures. Notify only after confirmed
  saves; keep recovery errors visible and preserve the draft on failure.

**Acceptance:** formation changes, captain, swaps and squad paging work;
`/?team=…` stays read-only; Load last saved and Load original fixture restore
their distinct snapshots; Save still sends the full existing lineup body.
Build stays disabled. Run lineup-board, draft, pitch-layout, squad-sale and
sale-hook tests. Check shared tile/dialog legacy consumers on other routes.

### 04 — Market screen

**Files:** `features/market/{MarketPage,MarketToolbar,MarketPlayerSearch,
MarketListHead,MarketRowView,MarketRowMotion}.*`, `cells/`, `actions/`,
`MarketFilterFields.tsx`, replace `MarketColumnFilterPopover.tsx`,
`MarketScreenLoading.*` and the shared rich-list stylesheet.

- Consolidate portrait and player identity; align position, points, three-week
  form, signed value change, availability, seal time and seller/actions.
  Use flat 64–80px rich rows and neutral submitted-bid labels.
- Align search and balance controls; keep the negative-balance warning and
  disabled-action explanations. Use short Tooltip help and Dialog/Sheet for
  richer content rather than putting controls in tooltips.
- Replace column popovers with a desktop Sheet/mobile Drawer using the same
  filter field helpers. Maintain one open state and a draft initialized from
  applied filters. Apply commits it, Cancel discards it, Clear column affects
  only that field, and Clear all retains its existing scope. Preserve deferred
  filtering and filter values across refetches.
- Migrate shared market action menus and bid/modify/cancel/withdraw/clause
  dialogs with grouped euro inputs and consistent pending/error presentation.
  Keep legacy presentation available to any remaining callers.
- Remove row spring motion and loader gradients. Include empty listings,
  filtered empty, degraded data, load failure and background refresh states.
  Emit deduplicated mutation feedback after the actual response.

**Acceptance:** listing eligibility, coach restrictions, lock countdown,
squad cap, spending/debt limits and pending-bid reconciliation remain intact.
Run market filter/heading/input tests, action/error tests and action-hook tests.
Use mocked APIs to validate confirmations and failure recovery. Check Players
and Player Detail for style leakage; no live bids, clause payments or sales
are needed for visual acceptance.

### 05 — Players catalog screen

**Files:** `features/players/PlayersPage.*`, `PlayersListHead.tsx`, replace
`PlayersColumnFilterPopover.tsx`, `PlayerBookmarkButton.*`,
`PlayerScreenLoading.*`; reuse migrated rich-list/search/action primitives.

- Match Market's row anatomy with owner and favorite controls. Replace the
  current focusable `li role="link"` and row navigation handlers with a real
  player-name/details Link. Keep owner links, Options and favorites independent.
- Align search and team select at 44px; apply the specified chevron spacing.
  Migrate column filters to Sheet/Drawer with the same Apply/Cancel policy,
  writing applied values through existing search-param helpers.
- Preserve the top-10 leaderboard mode and existing page size. Replace
  Previous/Next with three-number sliding pagination, retaining URL state,
  history navigation and page clamping.
- Change favorite icon stroke/fill only. Preserve per-user master-player IDs
  and storage behavior; use the same opt-in toggle when needed in details.
- Keep the existing compact layout at 800px and below, with accessible player
  identity/team and actions; prevent body-wide overflow. Migrate the catalog
  loader without prematurely changing the detail loader in the same file.

**Acceptance:** search/filter deep links survive reload and back/forward;
leaderboard, filters, page counts, favorites and ownership actions are correct.
Check 800px and 801px specifically. Run search-param, filter, favorites,
details-link and relevant market action tests. Add behavior coverage for
numeric paging and independent row links/actions where existing tests lack it.

### 06 — Player Detail identity, averages and form

**Files:** `features/players/PlayerDetailPage.*`, `PlayerAveragesPanel.tsx`,
`PlayerScreenLoading.*`; focused extracted identity/form components if needed.

- Add a Players → player breadcrumb while retaining existing return context.
  Replace the long summary card with a square identity block, availability
  beside the name, explanatory injury text and separate favorite/Options.
- Give the six position-specific averages equal visual weight and neutral
  values; use Collapsible for the remaining metrics. Preserve source labels,
  sample counts and existing scraped-data/fallback precedence.
- Replace form section banners with Anton headings and a short coral rule.
  Use square attached period controls and aligned fixture cards; retain
  minutes, DAZN points, expanded stats and totals.
- Present missing/unplayed detail values as an em dash plus explanatory
  status, preserving actual played zero values. Do not alter the market and
  catalog's established pending-match zero-with-warning convention.
- Complete detail initial/loading, invalid-player, error and segment-error
  presentation. Successful aggregate segments remain visible when another
  fails; changing a period does not blank an otherwise usable screen.
- Keep presentation extraction focused: query orchestration remains in the
  existing page, with display props passed into any new panel components.
  Scope new styles so the chart, match and fantasy panels remain functional
  until their following commits.

**Acceptance:** run `playerDetailContract.test.tsx`, averages, detail-format
and widget tests. Check all player positions, missing portraits, long names,
source fallbacks, partial segment failures and expanded stats in both themes.
Own-squad and market actions reuse the migrated confirmations correctly.

### 07 — Player Detail value, matches, timer and weather

**Files:** chart/custom-range region in `PlayerDetailPage.tsx`,
`PlayerDetailPage.css`, `PlayerMatchesSection.tsx`, its rules in
`playerDetailWidgets.css`; new date/calendar composition and focused chart
component if useful.

- Use a neutral Recharts plot, subtle horizontal grid and theme-aware labels,
  units and tooltip surface. Keep the coral value line, remove its drop-shadow,
  and use a dashed neutral trend line with an explicit legend if retained.
  Preserve the current series, deltas, axis formatting and domain calculations.
- Move Custom dates into Dialog/Drawer plus Calendar with From/To fields and
  Last days. Maintain separate draft/applied range, validate order, commit
  only on Apply, and restore focus on close; preserve the existing query
  parameters and preset behavior. No general-purpose Popover.
- Flatten previous/upcoming match cards, use small crest regions, one central
  score and outcome text plus a colored rail. Preserve competition, dates,
  player minutes and existing card limits.
- Make countdown an expandable part of the upcoming card, using the existing
  live clock. Preserve unconfirmed-kickoff handling; weather keeps available
  values/units and explicit unavailable reasons with neutral icons.

**Acceptance:** presets, valid/invalid date ranges, cancellation and Last days
produce the expected existing requests. Check empty chart, equal values,
negative/positive deltas, long opponent names, match outcomes, kickoff states
and missing forecasts. Verify calendar keyboard use and focus restoration in
a browser. Re-run detail contract/format/widget tests and add targeted date
apply/cancel checks if needed.

### 08 — Player Detail fantasy, news and injury history

**Files:** `PlayerFantasySection.tsx`, its rules in `playerDetailWidgets.css`,
existing format helpers only if presentation requires changes.

- Create three square panels with consistent header heights and responsive
  columns. Align hierarchy, starter likelihood, form and risk as labeled rows;
  preserve source labels and published probabilities.
- Make news a dated list with source labels and clamped headlines. Keep
  valid external links, missing-link fallbacks and access to complete titles.
- Make injury history a structured timeline distinguishing current and ended
  records, retaining diagnosis, dates, duration and missing-field treatment.
- Reuse NumberPagination independently for news and injuries. Adapt their
  current zero-based state to the primitive's one-based pages at the boundary;
  retain five records per page, newest-first order and clamping/reset behavior
  when the player or dataset changes.
- Finish theme styles across the whole Player Detail screen and its loaders.

**Acceptance:** run `PlayerFantasySection.test.tsx`, widget and detail-format
tests, plus the detail contract tests. Check no/one/many records, more than
three pages, independent page selection, player changes, absent dates and
long headlines. Every detail panel matches the briefing in both themes.

### 09 — Final theme rollout and cleanup

**Files:** shared styles/primitives and their remaining callers, `App.tsx`,
shell theme control, frontend documentation and updated screenshots.

- Remove legacy presentation branches and unused Modal/manual hover-panel/
  popover implementations after confirming no remaining imports. Remove old
  shared tokens only after mapping every consumer; preserve legitimate font
  or asset uses. Finish separating feature CSS from shared component CSS.
- Make semantic tokens the default throughout the app. Add a small theme
  preference control outside the three primary route links, default to light
  when no preference exists, and persist an explicit light/dark selection.
  Root theme changes must include portaled dialogs, sheets, menus, calendars,
  tooltips, toast content and chart labels.
- Check icon size, badge status labels, consistent spacing and typography,
  focus outlines and all reduced-motion behavior. Remove stale spring/scale,
  gradient, shadow, glow and blur rules, including inline chart styling.
- Update `docs/frontend.md` and screenshots to describe the final layout,
  theme, filters, independent links/actions, numeric paging and loading behavior.
  Compare final bundle size with 01 and remove unused generated primitives.

**Acceptance:** full route/state/browser review in both themes, full frontend
checks, no migration adapters or forbidden visual effects, and complete
reference-to-screen coverage below. Backend/OpenAPI regeneration is unnecessary
unless implementation scope separately changes an API route or schema.

## Validation and definition of a committable screen

For each implementation commit, run the repository's frontend commands from
`frontend/`:

```bash
bun run lint
bun run test
bun run build
```

Capture baseline results before implementation. Existing failures must be
recorded separately; a commit must introduce no new failures. Use targeted
Vitest runs during development, then the commands above before considering
the commit complete. Add tests for changed behavior such as pagination,
filter draft/apply/cancel, dialog focus/dismissal and custom date application;
do not add tests that merely assert CSS class names or exact styling.

Review each changed screen against the HTML examples at 375px, 800px, 1024px
and 1440px in both themes, plus its exact breakpoint boundaries where relevant.
Use deterministic mocked API data and a fixed clock for snapshots, including
long names, absent media, real zero values and missing values. A lightweight
browser fixture/screenshot workflow is enough; add a browser test dependency
only if existing tooling cannot cover the required interaction checks.

A screen commit is ready when:

- Its main view, responsive layout, overlays and loading/empty/error/degraded
  states follow the reference; unrelated routes show no unintended changes.
- Keyboard-only use covers Tab/Shift+Tab, Enter/Space, Escape, selector/menu
  keys, visible focus, focus trapping and restoration. Check touch actions,
  200% zoom and reduced motion in a real browser.
- Theme tests include portal content; the theme palette uses the guide's
  foreground pairings and text/icon status cues rather than color alone.
- Existing query/mutation/auth contracts still pass, and affected behavior
  tests cover the explicitly changed interactions.
- Validation evidence includes changed-screen screenshots, check results,
  and any remaining intentional legacy regions. Each detail-region commit
  checks the whole detail screen for shared-CSS regressions.
- The diff contains one screen or coherent screen region plus the minimal
  shared work it needs, with no unrelated refactors or backend changes.

## Reference coverage checklist

| Widget proposal / nonillustrated surface | Owning commit |
|----------------------------------------|---------------|
| 01 Header and lineup command bar | 02 shell; 03 command bar |
| 02 Ranking, pitch and squad | 03 |
| 03 Market row and deal controls | 04 |
| 04 Player catalog and favorites | 05 |
| 05 Player summary and average metrics | 06 |
| 06 Form / fixture cards | 06; these are currently in `PlayerDetailPage.tsx` |
| 07 Market-value chart | 07 |
| 08 Previous/upcoming matches, timer and weather | 07 |
| 09 Fantasy profile, news and injury history | 08 |
| 10 Footer and small graphic elements | 02 footer; each screen's icons/badges; 09 audit |
| Auth gates, contact, not-found and app-error screen | 02 |
| Per-screen loaders, errors, tooltips, filters and confirmations | Owning screen commit, using 01 primitives |
| Root theme preference and removal of compatibility paths | 09 |

Completion means all rows are implemented and verified, both themes work
throughout the app, and each screen's migration can be identified in Git history.

## Completion record — 2026-10-12

All nine stages are implemented. Stages 01–08 are recorded as the corresponding
screen commits; stage 09 finishes root theme rollout, removes legacy Modal,
manual hover panels, motion wrappers/dependency and obsolete style rules,
and updates the documentation and browser fixtures.

Implementation decisions:

- Complex controls use Base UI directly behind local components and CSS,
  retaining the existing Vite/CSS architecture without adding Tailwind.
- The filter sheet uses one controlled Base UI Dialog with desktop side-panel
  and mobile bottom-panel positioning. It does not add gesture interactions
  or duplicate filter state across two overlay implementations.
- Rich rows retain labeled-list semantics; detailed statistics remain tables.
- Light is the default. The header theme control persists an explicit choice,
  and document-root variables also theme portals and Recharts labels.
- The date/calendar editor is a separate lazy chunk, loaded when Custom opens.
- Notifications are issued in confirmed mutation callbacks; persistent form
  errors and eligibility checks remain in their existing feature controllers.

Validation completed:

- Baseline: lint, 371 tests and production build passed.
- Final: lint, **377 tests across 53 files**, and production build passed.
- **43 Chromium browser checks** passed using intercepted auth/API responses:
  32 screen/theme/width combinations, filter focus/draft cancellation, custom
  calendar apply/cancel, four auth gates, the 800/801px catalog boundary,
  contact/not-found routes, and confirmed-response bid notification timing.
- Screenshots were inspected for neutral panels, typography, missing media,
  responsive overflow and both themes. Current product captures are stored in
  `docs/images/screenshots/` and linked from `docs/frontend.md`.
- No backend API route, schema, auth contract or generated OpenAPI changed.

Bundle comparison (Vite production output, before → after):

| Artifact | Baseline | Final |
|----------|----------|-------|
| Main JavaScript | 708.07 kB / 213.40 kB gzip | 807.17 kB / 248.77 kB gzip |
| Player Detail JavaScript | 453.08 kB / 127.10 kB gzip | 471.86 kB / 132.20 kB gzip |
| On-demand calendar JavaScript | None | 69.79 kB / 20.73 kB gzip |

Base UI supplies the additional accessible control behavior. The production
build retains its pre-existing large-chunk advisory. Font assets add the real
Anton and AT Aero Semibold faces required by the briefing.
