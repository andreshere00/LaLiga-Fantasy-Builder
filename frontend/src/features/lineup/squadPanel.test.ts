// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import { SQUAD_DISPLAY_CAP, SQUAD_PAGE_SIZE, squadPageSlice } from "./squadPanel";

// ---- Happy path ---- //

describe("squadPageSlice", () => {
  it("squadPageSlice_first_page_returns_eight_items", () => {
    const items = Array.from({ length: 20 }, (_, index) => index);
    expect(squadPageSlice(items, 0).pageItems).toHaveLength(SQUAD_PAGE_SIZE);
  });

  it("squadPageSlice_caps_at_twenty_four_players", () => {
    const items = Array.from({ length: 40 }, (_, index) => index);
    const { pageCount, pageItems } = squadPageSlice(items, 2);
    expect(pageCount).toBe(SQUAD_DISPLAY_CAP / SQUAD_PAGE_SIZE);
    expect(pageItems).toHaveLength(SQUAD_DISPLAY_CAP - 2 * SQUAD_PAGE_SIZE);
  });

  it("squadPageSlice_clamps_page_index", () => {
    expect(squadPageSlice([1, 2, 3], 99).page).toBe(0);
  });
});
