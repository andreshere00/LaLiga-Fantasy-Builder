import { squadMatchesSearch } from "../lineup/lineupDraft";
import type { MarketRow } from "./model/row";

/** Keeps market listings whose display name matches the search query. */
export function filterMarketRowsBySearch(
  rows: readonly MarketRow[],
  query: string,
): MarketRow[] {
  return rows.filter((row) => squadMatchesSearch(row.name, query));
}
