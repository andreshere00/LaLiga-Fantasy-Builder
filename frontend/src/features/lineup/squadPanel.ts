import { useMediaQuery } from "../../hooks/useMediaQuery";
import { t } from "../../i18n";
/** Usual roster size shown in the squad count. Pagination includes every player. */
export const SQUAD_DISPLAY_CAP = 24;

/** Label for current squad size. Counts above the usual roster omit the cap. */
export function squadCountLabel(
  count: number,
  cap: number = SQUAD_DISPLAY_CAP,
): string {
  if (count > cap) return t(count === 1 ? "{{0}} player" : "{{0}} players", { 0: count });
  return t(count === 1 ? "{{0}}/{{1}} player" : "{{0}}/{{1}} players", { 0: count, 1: cap });
}

/** Players visible on one squad panel page (2×4 grid). */
export const SQUAD_PAGE_SIZE = 8;
/** Narrow layout shows three columns, so a page is 3×3 and never leaves a gap in the last row. */
export const SQUAD_PAGE_SIZE_NARROW = 9;
/** Mirrors the stacked-layout media query in `LineupPage.css`. */
const NARROW_QUERY = "(max-width: 1099px), (max-aspect-ratio: 4/3)";

/** Page size that matches the grid the current viewport renders. */
export function useSquadPageSize(): number {
  return useMediaQuery(NARROW_QUERY) ? SQUAD_PAGE_SIZE_NARROW : SQUAD_PAGE_SIZE;
}

export type SquadPageSlice<T> = {
  pageItems: T[];
  page: number;
  pageCount: number;
};

/** Page index that contains a master player, when that player is in the list. */
export function squadPageForPlayer(
  ids: readonly (string | null | undefined)[],
  playerId: string | null,
  pageSize: number = SQUAD_PAGE_SIZE,
): number | null {
  if (!playerId) return null;
  const index = ids.findIndex((id) => id === playerId);
  if (index < 0) return null;
  return Math.floor(index / pageSize);
}

/** Returns one page of squad cards. Every player stays reachable. */
export function squadPageSlice<T>(
  items: readonly T[], page: number, pageSize: number = SQUAD_PAGE_SIZE,
): SquadPageSlice<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const start = safePage * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    page: safePage,
    pageCount,
  };
}
