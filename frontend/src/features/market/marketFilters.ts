import { normalizeSearchText } from "../../searchText";
import type { Availability } from "./model/availability";
import type { MarketRow } from "./model/row";

export type NumericRange = { min: number | null; max: number | null };

export type MarketFilters = {
  /** Toolbar search: player name, seller, or team name. */
  query: string;
  /** Player column filter: player name only. */
  player: string;
  /** Sell options column filter: seller only. */
  seller: string;
  marketValue: NumericRange;
  points: NumericRange;
  form: NumericRange;
  availability: ReadonlySet<Availability>;
  positions: ReadonlySet<number>;
};

/** Returns a fresh filter object safe to store in React state. */
export function createEmptyMarketFilters(): MarketFilters {
  return {
    query: "",
    player: "",
    seller: "",
    marketValue: { min: null, max: null },
    points: { min: null, max: null },
    form: { min: null, max: null },
    availability: new Set(),
    positions: new Set(),
  };
}

export const EMPTY_MARKET_FILTERS: MarketFilters = createEmptyMarketFilters();

function rangeIsActive(range: NumericRange): boolean {
  return range.min != null || range.max != null;
}

function matchesRange(value: number | null, range: NumericRange): boolean {
  if (!rangeIsActive(range)) return true;
  if (value == null) return false;
  if (range.min != null && value < range.min) return false;
  if (range.max != null && value > range.max) return false;
  return true;
}

function matchesSubstring(haystack: string, query: string): boolean {
  const normalized = normalizeSearchText(query);
  if (!normalized) return true;
  return normalizeSearchText(haystack).includes(normalized);
}

function matchesQuery(row: MarketRow, query: string): boolean {
  const normalized = normalizeSearchText(query);
  if (!normalized) return true;
  const haystacks = [row.name, row.seller, row.teamName ?? ""];
  return haystacks.some((value) => normalizeSearchText(value).includes(normalized));
}

function matchesAvailability(row: MarketRow, selected: ReadonlySet<Availability>): boolean {
  if (selected.size === 0) return true;
  return selected.has(row.availability);
}

function matchesPosition(row: MarketRow, selected: ReadonlySet<number>): boolean {
  if (selected.size === 0) return true;
  if (row.positionId == null) return false;
  return selected.has(row.positionId);
}

/** Applies every active market filter; conditions combine with AND. */
export function applyMarketFilters(
  rows: readonly MarketRow[],
  filters: MarketFilters,
): MarketRow[] {
  return rows.filter(
    (row) =>
      matchesQuery(row, filters.query) &&
      matchesSubstring(row.name, filters.player) &&
      matchesSubstring(row.seller, filters.seller) &&
      matchesRange(row.marketValue, filters.marketValue) &&
      matchesRange(row.points, filters.points) &&
      matchesRange(row.form, filters.form) &&
      matchesAvailability(row, filters.availability) &&
      matchesPosition(row, filters.positions),
  );
}

/** Counts non-default filter settings for the toolbar badge. */
export function activeFilterCount(filters: MarketFilters): number {
  let count = 0;
  if (normalizeSearchText(filters.query)) count += 1;
  if (normalizeSearchText(filters.player)) count += 1;
  if (normalizeSearchText(filters.seller)) count += 1;
  if (rangeIsActive(filters.marketValue)) count += 1;
  if (rangeIsActive(filters.points)) count += 1;
  if (rangeIsActive(filters.form)) count += 1;
  if (filters.availability.size > 0) count += 1;
  if (filters.positions.size > 0) count += 1;
  return count;
}

/** Distinct seller labels from the current listings, sorted for dropdowns. */
export function sellerOptions(rows: readonly MarketRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    const seller = row.seller.trim();
    if (seller) names.add(seller);
  }
  return [...names].sort((left, right) => left.localeCompare(right, "es"));
}
