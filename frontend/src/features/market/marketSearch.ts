import { applyMarketFilters, EMPTY_MARKET_FILTERS } from "./marketFilters";
import type { MarketRow } from "./model/row";

/** Keeps market listings whose display name matches the search query. */
export function filterMarketRowsBySearch(
  rows: readonly MarketRow[],
  query: string,
): MarketRow[] {
  return applyMarketFilters(rows, {
    ...EMPTY_MARKET_FILTERS,
    text: query,
    field: "player",
  });
}
