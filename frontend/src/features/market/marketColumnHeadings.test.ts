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

  it("marketColumnHeadings_marks_player_and_sell_options_from_column_text_only", () => {
    const headings = marketColumnHeadings({
      ...createEmptyMarketFilters(),
      query: "bar",
      player: "foo",
      seller: "baz",
    });
    expect(headings.player.filtered).toBe(true);
    expect(headings.sellOptions.filtered).toBe(true);
  });

  it("marketColumnHeadings_query_does_not_mark_player_column", () => {
    const headings = marketColumnHeadings({
      ...createEmptyMarketFilters(),
      query: "bar",
    });
    expect(headings.player.filtered).toBe(false);
    expect(headings.sellOptions.filtered).toBe(false);
  });

  it("marketColumnHeadings_uses_base_labels_when_no_filters", () => {
    const headings = marketColumnHeadings(createEmptyMarketFilters());
    expect(headings.marketValue.label).toBe("Market value");
    expect(headings.fsyp.filtered).toBe(false);
  });
});
