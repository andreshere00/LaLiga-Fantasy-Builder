# Plan: market search filters

Status: proposed (not implemented).

## Goal

Extend the market search bar so listings can be filtered by value on these fields:
seller, player name, team, market value, points, form and availability. Filtering
and panel changes must use smooth transitions.

## Current state

- The search bar only matches the player name: `filterMarketRowsBySearch` in
  `frontend/src/features/market/marketSearch.ts` calls `squadMatchesSearch`.
- `normalizeSearchText` (`frontend/src/searchText.ts`) already ignores case and accents.
- `MarketRow` (`frontend/src/features/market/model/row.ts`) already exposes `name`,
  `seller`, `marketValue`, `points`, `form` and `availability`.
- `MarketRow` has only `teamBadgeUrl` for the team; there is no team name.
- Motion (`motion/react`) is already a dependency and used in `Modal.tsx` and
  `PitchMotion.tsx`. Tests skip animations through `src/test-setup.ts`.

## Design

### 1. Team name on the row

- Add `teamName: string | null` to `MarketRow` and fill it in `row.ts`.
- Resolve it from `assets/teams_master.json` (42 teams with `id`, `dspId`, `name`,
  `shortName`), keyed by `playerMaster.team.id` / `playerMaster.teamId`. Reuse the
  lookup pattern of `buildTeamBadgeByTeamIdMap` in `frontend/src/api/mappers.ts`
  (export a `teamNameFromTeamId` helper next to `teamBadgeFromTeamId`).
- Fallback to `team.name` / `team.shortName` when present on the master record.

### 2. Filter model (pure logic)

New `frontend/src/features/market/marketFilters.ts`:

```ts
type NumericRange = { min: number | null; max: number | null };

type MarketFilters = {
  text: string;
  field: "all" | "player" | "seller" | "team";
  marketValue: NumericRange;
  points: NumericRange;
  form: NumericRange;
  availability: ReadonlySet<Availability>; // empty = every state
};

const EMPTY_MARKET_FILTERS: MarketFilters = { /* all neutral */ };
function applyMarketFilters(rows: readonly MarketRow[], f: MarketFilters): MarketRow[];
function activeFilterCount(f: MarketFilters): number;
function sellerOptions(rows: readonly MarketRow[]): string[];
```

Rules:

- All conditions combine with AND.
- Text uses `normalizeSearchText` and matches only the field chosen in `field`
  (`all` checks player, seller and team name).
- A range only excludes rows with a `null` value when that range is active.
- Min and max are inclusive.
- `marketFilters.ts` replaces `marketSearch.ts`; keep `filterMarketRowsBySearch`
  as a thin wrapper if other code still imports it, otherwise delete it with its test.

### 3. UI

- `MarketPlayerSearch.tsx`: keep the search input and add a "Filters" button with an
  active-filter badge, plus "Clear" when `activeFilterCount > 0`.
- New `MarketFilterPanel.tsx` under the bar:
  - "Search in" selector (All, Player, Seller, Team).
  - Seller dropdown populated by `sellerOptions` (optional shortcut that sets the
    text and field).
  - Min/max inputs for market value, points and form (integer inputs formatted with
    the existing `formatIntegerAmount` helpers).
  - Availability chips (available, questionable, unavailable).
- `MarketToolbar.tsx` keeps the search and Balance row aligned; the panel opens
  below that row and does not move Balance.
- Empty result: keep `MARKET_SEARCH_NO_MATCHES` and add a "Clear filters" button.
- Small screens: the panel becomes a single column.

### 4. Smooth transitions

- Panel: `AnimatePresence` with a height and opacity transition on open and close.
- Rows: wrap each `MarketRowView` item in an `m.li` with `layout="position"`,
  fade-in on enter and fade/collapse on exit, so rows reorder and disappear smoothly.
- Features: `layout` needs `domMax`; measure the bundle impact (the build currently
  reports about 503 kB) and fall back to opacity/height-only transitions with
  `domAnimation` if the growth is not acceptable.
- Typing: apply the text filter through `useDeferredValue` (or a ~150 ms debounce) so
  the list does not re-animate on every keystroke.
- Accessibility: `MotionConfig reducedMotion="user"`, as elsewhere in the app.

### 5. Page integration

- `MarketPage.tsx`: replace `playerSearch` state with `filters` and compute
  `visibleRows` with `applyMarketFilters`.
- Filters are kept across market refetches (state lives in the page, not in the data).
- Optional: persist filters per league in `sessionStorage`.

## Tests

Follow the project layout (Arrange-Act-Assert, the four section headers).

- `marketFilters.test.ts`:
  - text per field, including accents and case;
  - inclusive range limits;
  - `null` values with an active and an inactive range;
  - several availability states;
  - combined filters;
  - `EMPTY_MARKET_FILTERS` returns every row;
  - `activeFilterCount` and `sellerOptions`.
- `mappers.test.ts`: `teamNameFromTeamId` for known id, `dspId` and unknown id.
- `marketRows.test.ts`: `teamName` is filled from the master team.
- Component tests: filter badge count and the empty state with "Clear filters".

## Delivery order

1. `teamName` on `MarketRow` with mapper tests.
2. `marketFilters.ts` with tests, wired into `MarketPage.tsx` (no new UI yet).
3. `MarketFilterPanel` and toolbar changes.
4. Transitions (panel and rows).
5. Update `docs/frontend.md` (market section).

## Open decisions

- Form: filter the numeric average `form` (proposed) or the last matchday points
  from `formRecent`.
- Text matching: one text box plus a "Search in" selector (proposed) or one
  independent text box per field.
- Persistence: keep filters only in memory (proposed) or in `sessionStorage` per league.
- Row animation depth: `domMax` layout animations (proposed) versus the lighter
  `domAnimation` with opacity/height only.
