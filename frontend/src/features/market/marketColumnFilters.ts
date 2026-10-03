import type { MarketColumnKey } from "./marketColumnHeadings";
import type { MarketFilters } from "./marketFilters";

/** True when the column exposes a filter control in the table header. */
export function isMarketColumnFilterable(column: MarketColumnKey): boolean {
  return column !== "sealEnd";
}

/** Clears the filter state owned by a single table column. */
export function clearMarketColumnFilter(
  filters: MarketFilters,
  column: MarketColumnKey,
): MarketFilters {
  switch (column) {
    case "player":
      return { ...filters, player: "" };
    case "sellOptions":
      return { ...filters, seller: "" };
    case "fsyp":
      return { ...filters, points: { min: null, max: null } };
    case "form":
      return { ...filters, form: { min: null, max: null } };
    case "marketValue":
      return { ...filters, marketValue: { min: null, max: null } };
    case "availability":
      return { ...filters, availability: new Set() };
    case "position":
      return { ...filters, positions: new Set() };
    default:
      return filters;
  }
}
