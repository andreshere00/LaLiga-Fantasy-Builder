// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import { createEmptyMarketFilters } from "./marketFilters";
import { marketColumnHeadings } from "./marketColumnHeadings";

// ---- Happy path ---- //

describe("marketColumnHeadings", () => {
  it("marketColumnHeadings_marks_fsyp_column_when_points_range_active", () => {
    const headings = marketColumnHeadings({
      ...createEmptyMarketFilters(),
      points: { min: 10, max: null },
    });
    expect(headings.fsyp.label).toBe("FSYP (≥ 10)");
    expect(headings.fsyp.filtered).toBe(true);
  });

  it("marketColumnHeadings_marks_player_and_sell_options_for_search_all", () => {
    const headings = marketColumnHeadings({
      ...createEmptyMarketFilters(),
      text: "bar",
      field: "all",
    });
    expect(headings.player.filtered).toBe(true);
    expect(headings.sellOptions.filtered).toBe(true);
  });

  it("marketColumnHeadings_uses_base_labels_when_no_filters", () => {
    const headings = marketColumnHeadings(createEmptyMarketFilters());
    expect(headings.marketValue.label).toBe("Market value");
    expect(headings.fsyp.filtered).toBe(false);
  });
});
