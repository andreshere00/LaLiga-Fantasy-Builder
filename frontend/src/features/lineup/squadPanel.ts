/** Squad panel shows up to this many players across paginated views. */
export const SQUAD_DISPLAY_CAP = 24;

/** Label for current squad size against the roster cap. */
export function squadCountLabel(
  count: number,
  cap: number = SQUAD_DISPLAY_CAP,
): string {
  return `${count}/${cap} players`;
}

/** Players visible on one squad panel page (2×4 grid). */
export const SQUAD_PAGE_SIZE = 8;

export type SquadPageSlice<T> = {
  pageItems: T[];
  page: number;
  pageCount: number;
};

/** Returns one page of squad cards (capped at {@link SQUAD_DISPLAY_CAP}). */
export function squadPageSlice<T>(items: readonly T[], page: number): SquadPageSlice<T> {
  const capped = items.slice(0, SQUAD_DISPLAY_CAP);
  const pageCount = Math.max(1, Math.ceil(capped.length / SQUAD_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const start = safePage * SQUAD_PAGE_SIZE;
  return {
    pageItems: capped.slice(start, start + SQUAD_PAGE_SIZE),
    page: safePage,
    pageCount,
  };
}
