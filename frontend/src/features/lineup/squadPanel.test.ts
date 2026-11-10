// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import { SQUAD_PAGE_SIZE, squadCountLabel, squadPageForPlayer, squadPageSlice } from "./squadPanel";

// ---- Happy path ---- //

describe("squadPageSlice", () => {
  it("squadPageSlice_first_page_returns_eight_items", () => {
    const items = Array.from({ length: 20 }, (_, index) => index);
    expect(squadPageSlice(items, 0).pageItems).toHaveLength(SQUAD_PAGE_SIZE);
  });

  it("squadPageSlice_pages_every_player", () => {
    const items = Array.from({ length: 40 }, (_, index) => index);
    const page = squadPageSlice(items, 3);
    expect(page.pageCount).toBe(5);
    expect(page.pageItems).toEqual([24, 25, 26, 27, 28, 29, 30, 31]);
  });

  it("squadPageSlice_narrowPageSize_fillsThreeByThreeRows", () => {
    const items = Array.from({ length: 24 }, (_, index) => index);
    const page = squadPageSlice(items, 2, 9);
    expect(page.pageCount).toBe(3);
    expect(page.pageItems).toEqual([18, 19, 20, 21, 22, 23]);
    expect(squadPageForPlayer(items.map(String), "10", 9)).toBe(1);
  });

  it("squadPageSlice_clamps_page_index", () => {
    expect(squadPageSlice([1, 2, 3], 99).page).toBe(0);
  });

  it("squadPageForPlayer_later_page_focuses_that_card", () => {
    const ids = Array.from({ length: 20 }, (_, index) => String(index + 1));
    expect(squadPageForPlayer(ids, "9")).toBe(1);
    expect(squadPageForPlayer(ids, "missing")).toBeNull();
  });

  it("squadCountLabel_count_against_cap", () => {
    expect(squadCountLabel(18)).toBe("18/24 players");
    expect(squadCountLabel(0, 24)).toBe("0/24 players");
    expect(squadCountLabel(26)).toBe("26 players");
  });
});
