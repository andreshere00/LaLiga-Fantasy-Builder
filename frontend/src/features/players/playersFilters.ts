import { normalizeSearchText } from "../../searchText";
import type { Availability } from "../market/model/availability";
import type { NumericRange } from "../market/marketFilters";
import type { PlayerRow } from "./model/playerRow";
import type { PlayersFilters } from "./playersSearchParams";

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

function matchesQuery(row: PlayerRow, query: string): boolean {
  const normalized = normalizeSearchText(query);
  if (!normalized) return true;
  const haystacks = [row.name, row.teamName ?? "", row.ownedBy];
  return haystacks.some((value) => normalizeSearchText(value).includes(normalized));
}

function matchesAvailability(row: PlayerRow, selected: ReadonlySet<Availability>): boolean {
  if (selected.size === 0) return true;
  return selected.has(row.availability);
}

function matchesPosition(row: PlayerRow, selected: ReadonlySet<number>): boolean {
  if (selected.size === 0) return true;
  if (row.positionId == null) return false;
  return selected.has(row.positionId);
}

/** Applies every active players filter; conditions combine with AND. */
export function applyPlayersFilters(
  rows: readonly PlayerRow[],
  filters: PlayersFilters,
): PlayerRow[] {
  return rows.filter(
    (row) =>
      matchesQuery(row, filters.query) &&
      matchesSubstring(row.name, filters.player) &&
      matchesSubstring(row.ownedBy, filters.owner) &&
      matchesSubstring(row.teamName ?? "", filters.team) &&
      matchesRange(row.marketValue, filters.marketValue) &&
      matchesRange(row.points, filters.points) &&
      matchesRange(row.form, filters.form) &&
      matchesAvailability(row, filters.availability) &&
      matchesPosition(row, filters.positions),
  );
}

export function activePlayersFilterCount(filters: PlayersFilters): number {
  let count = 0;
  if (normalizeSearchText(filters.query)) count += 1;
  if (normalizeSearchText(filters.player)) count += 1;
  if (normalizeSearchText(filters.owner)) count += 1;
  if (normalizeSearchText(filters.team)) count += 1;
  if (rangeIsActive(filters.marketValue)) count += 1;
  if (rangeIsActive(filters.points)) count += 1;
  if (rangeIsActive(filters.form)) count += 1;
  if (filters.availability.size > 0) count += 1;
  if (filters.positions.size > 0) count += 1;
  return count;
}

export const PLAYERS_PAGE_SIZE = 15;
export const PLAYERS_LEADERBOARD_SIZE = 10;

/** Distinct owner labels for column filter suggestions. */
export function ownerOptions(rows: readonly PlayerRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) set.add(row.ownedBy);
  return [...set].sort((a, b) => a.localeCompare(b));
}
