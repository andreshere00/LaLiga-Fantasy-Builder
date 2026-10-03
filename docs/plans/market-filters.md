# Plan: market search filters

Status: **implemented** (column-header filters on `feat/frontend-miscelanea`).

## Shipped behaviour

- **Toolbar** (`MarketToolbar`, `MarketPlayerSearch`): `query` matches player name,
  seller, or team name (accent-insensitive via `normalizeSearchText`).
- **Column filters** (`MarketListHead`, `MarketColumnFilterPopover`): funnel icons
  open popovers for player name, seller, position chips, FSYP/form ranges, market
  value range, and availability chips. Seal end is not filterable.
- **Filter model** (`marketFilters.ts`): `query`, `player`, and `seller` strings
  combine with AND against numeric ranges and chip sets. Toolbar search does not
  light column funnels; clearing a column only clears that column’s text or range.
- **Performance**: `useDeferredValue` on filter state; row enter/exit uses
  `motion/react` with `domAnimation` and `MotionConfig reducedMotion="user"`.
- **Tests**: `marketFilters.test.ts`, column clear/heading tests, filter range UI
  test, plus existing market search wrapper.

## Key files

| Area | Path |
|------|------|
| Pure logic | `frontend/src/features/market/marketFilters.ts` |
| Column clear | `frontend/src/features/market/marketColumnFilters.ts` |
| Headings | `frontend/src/features/market/marketColumnHeadings.ts` |
| Popover fields | `frontend/src/features/market/MarketFilterFields.tsx` |
| Page state | `frontend/src/features/market/MarketPage.tsx` |

## Not implemented (deferred)

- Session persistence of filters per league.
- Separate toolbar “team only” field (team is included in `query`).
