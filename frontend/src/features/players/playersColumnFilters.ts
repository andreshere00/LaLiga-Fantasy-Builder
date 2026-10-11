import type { PlayersColumnKey } from "./playersColumnHeadings";
import type { PlayersFilters } from "./playersSearchParams";

/** Clears the filter state owned by a single players table column. */
export function clearPlayersColumnFilter(
  filters: PlayersFilters,
  column: PlayersColumnKey,
): PlayersFilters {
  switch (column) {
    case "name":
      return { ...filters, player: "" };
    case "team":
      return { ...filters, team: "" };
    case "owner":
      return { ...filters, owner: "" };
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
