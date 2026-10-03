// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import type { MarketRow } from "./model/row";
import {
  activeFilterCount,
  applyMarketFilters,
  EMPTY_MARKET_FILTERS,
  sellerOptions,
  type MarketFilters,
} from "./marketFilters";

function row(overrides: Partial<MarketRow> = {}): MarketRow {
  return {
    id: "1",
    marketId: "1",
    playerId: null,
    playerTeamId: null,
    name: "Player",
    positionId: null,
    photoUrl: null,
    teamBadgeUrl: null,
    teamName: null,
    points: null,
    form: null,
    formRecent: [],
    formRecentWeeks: [],
    averagePoints: null,
    marketValue: null,
    variation: null,
    variationPercent: null,
    availability: "available",
    expiresAt: null,
    seller: "LaLiga",
    sellerTeamId: null,
    sellerKind: "laliga",
    buyoutClause: null,
    clauseUnlockAt: null,
    isShielded: false,
    myBid: null,
    directOffer: false,
    valueHistory: [],
    ...overrides,
  };
}

function withFilters(partial: Partial<MarketFilters>): MarketFilters {
  return {
    ...EMPTY_MARKET_FILTERS,
    ...partial,
    marketValue: { ...EMPTY_MARKET_FILTERS.marketValue, ...partial.marketValue },
    points: { ...EMPTY_MARKET_FILTERS.points, ...partial.points },
    form: { ...EMPTY_MARKET_FILTERS.form, ...partial.form },
    availability: partial.availability ?? EMPTY_MARKET_FILTERS.availability,
    positions: partial.positions ?? EMPTY_MARKET_FILTERS.positions,
  };
}

// ---- Happy path ---- //

describe("applyMarketFilters", () => {
  it("applyMarketFilters_empty_filters_returns_every_row", () => {
    const rows = [row({ name: "A" }), row({ id: "2", name: "B" })];
    expect(applyMarketFilters(rows, EMPTY_MARKET_FILTERS)).toEqual(rows);
  });

  it("applyMarketFilters_player_column_matches_name_only", () => {
    const rows = [
      row({ name: "Marcos Llorente", seller: "Marcos FC" }),
      row({ id: "2", name: "Unai Simón" }),
    ];
    const filters = withFilters({ player: "llor" });
    expect(applyMarketFilters(rows, filters).map((entry) => entry.name)).toEqual([
      "Marcos Llorente",
    ]);
  });

  it("applyMarketFilters_seller_column_matches_seller_only", () => {
    const rows = [
      row({ name: "P1", seller: "Rival Manager" }),
      row({ id: "2", name: "P2", seller: "LaLiga" }),
    ];
    const filters = withFilters({ seller: "rival" });
    expect(applyMarketFilters(rows, filters).map((entry) => entry.name)).toEqual(["P1"]);
  });

  it("applyMarketFilters_query_matches_player_seller_and_team", () => {
    const rows = [
      row({ name: "Hidden", seller: "LaLiga", teamName: "Sevilla" }),
      row({ id: "2", name: "Star", seller: "Sevilla Fan", teamName: "Other" }),
    ];
    const filters = withFilters({ query: "sevilla" });
    expect(applyMarketFilters(rows, filters)).toHaveLength(2);
  });

  it("applyMarketFilters_query_and_player_both_apply", () => {
    const rows = [
      row({ id: "a", name: "Laporte", seller: "A" }),
      row({ id: "b", name: "Laporte Jr", seller: "A" }),
      row({ id: "c", name: "Laporte", seller: "B" }),
    ];
    const filters = withFilters({ query: "laporte", player: "jr" });
    expect(applyMarketFilters(rows, filters).map((entry) => entry.id)).toEqual(["b"]);
  });

  it("applyMarketFilters_text_ignores_accents_and_case", () => {
    const rows = [row({ name: "Álvaro Núñez" }), row({ id: "2", name: "Yuri" })];
    const filters = withFilters({ player: "nunez" });
    expect(applyMarketFilters(rows, filters).map((entry) => entry.name)).toEqual([
      "Álvaro Núñez",
    ]);
    expect(
      applyMarketFilters(rows, withFilters({ player: "ÁLVARO" })).map((entry) => entry.name),
    ).toEqual(["Álvaro Núñez"]);
  });

  it("applyMarketFilters_range_limits_are_inclusive", () => {
    const rows = [
      row({ id: "a", marketValue: 100 }),
      row({ id: "b", marketValue: 200 }),
      row({ id: "c", marketValue: 300 }),
    ];
    const filters = withFilters({ marketValue: { min: 100, max: 200 } });
    expect(applyMarketFilters(rows, filters).map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("applyMarketFilters_active_range_excludes_null_values", () => {
    const rows = [row({ id: "a", points: 10 }), row({ id: "b", points: null })];
    const filters = withFilters({ points: { min: 0, max: null } });
    expect(applyMarketFilters(rows, filters).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("applyMarketFilters_inactive_range_keeps_null_values", () => {
    const rows = [row({ id: "a", form: null }), row({ id: "b", form: 5 })];
    expect(applyMarketFilters(rows, EMPTY_MARKET_FILTERS).map((entry) => entry.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("applyMarketFilters_availability_subset", () => {
    const rows = [
      row({ id: "a", availability: "available" }),
      row({ id: "b", availability: "questionable" }),
      row({ id: "c", availability: "unavailable" }),
    ];
    const filters = withFilters({
      availability: new Set(["questionable", "unavailable"]),
    });
    expect(applyMarketFilters(rows, filters).map((entry) => entry.id)).toEqual(["b", "c"]);
  });

  it("applyMarketFilters_position_subset", () => {
    const rows = [
      row({ id: "a", positionId: 4 }),
      row({ id: "b", positionId: 2 }),
      row({ id: "c", positionId: null }),
    ];
    const filters = withFilters({ positions: new Set([2, 4]) });
    expect(applyMarketFilters(rows, filters).map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("applyMarketFilters_combined_filters_use_and_logic", () => {
    const rows = [
      row({ id: "a", name: "Laporte", marketValue: 500 }),
      row({ id: "b", name: "Laporte Jr", marketValue: 100 }),
      row({ id: "c", name: "Other", marketValue: 500 }),
    ];
    const filters = withFilters({
      player: "laporte",
      marketValue: { min: 400, max: null },
    });
    expect(applyMarketFilters(rows, filters).map((entry) => entry.id)).toEqual(["a"]);
  });
});

describe("activeFilterCount", () => {
  it("activeFilterCount_empty_filters_is_zero", () => {
    expect(activeFilterCount(EMPTY_MARKET_FILTERS)).toBe(0);
  });

  it("activeFilterCount_sums_text_ranges_and_availability", () => {
    const filters = withFilters({
      query: "x",
      marketValue: { min: 1, max: null },
      availability: new Set(["available"]),
    });
    expect(activeFilterCount(filters)).toBe(3);
  });
});

describe("sellerOptions", () => {
  it("sellerOptions_returns_sorted_unique_sellers", () => {
    const rows = [
      row({ seller: "Zara Team" }),
      row({ id: "2", seller: "Alpha" }),
      row({ id: "3", seller: "Alpha" }),
    ];
    expect(sellerOptions(rows)).toEqual(["Alpha", "Zara Team"]);
  });
});
