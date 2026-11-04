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

export type SquadPageSlice<T> = {
  pageItems: T[];
  page: number;
  pageCount: number;
};

/** Returns one page of squad cards. Every player stays reachable. */
export function squadPageSlice<T>(items: readonly T[], page: number): SquadPageSlice<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / SQUAD_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const start = safePage * SQUAD_PAGE_SIZE;
  return {
    pageItems: items.slice(start, start + SQUAD_PAGE_SIZE),
    page: safePage,
    pageCount,
  };
}
