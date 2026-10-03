// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import { clearMarketColumnFilter } from "./marketColumnFilters";
import { createEmptyMarketFilters } from "./marketFilters";

// ---- Happy path ---- //

describe("clearMarketColumnFilter", () => {
  it("clearMarketColumnFilter_clears_fsyp_range", () => {
    const filters = {
      ...createEmptyMarketFilters(),
      points: { min: 5, max: 10 },
    };
    expect(clearMarketColumnFilter(filters, "fsyp").points).toEqual({ min: null, max: null });
  });

  it("clearMarketColumnFilter_clears_position_set", () => {
    const filters = {
      ...createEmptyMarketFilters(),
      positions: new Set([2, 4]),
    };
    expect(clearMarketColumnFilter(filters, "position").positions.size).toBe(0);
  });

  it("clearMarketColumnFilter_clears_player_text_keeps_query", () => {
    const filters = {
      ...createEmptyMarketFilters(),
      query: "toolbar",
      player: "x",
    };
    expect(clearMarketColumnFilter(filters, "player").player).toBe("");
    expect(clearMarketColumnFilter(filters, "player").query).toBe("toolbar");
  });

  it("clearMarketColumnFilter_clears_seller_text", () => {
    const filters = {
      ...createEmptyMarketFilters(),
      seller: "LaLiga",
    };
    expect(clearMarketColumnFilter(filters, "sellOptions").seller).toBe("");
  });
});
