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
  };
}

// ---- Happy path ---- //

describe("applyMarketFilters", () => {
  it("applyMarketFilters_empty_filters_returns_every_row", () => {
    const rows = [row({ name: "A" }), row({ id: "2", name: "B" })];
    expect(applyMarketFilters(rows, EMPTY_MARKET_FILTERS)).toEqual(rows);
  });

  it("applyMarketFilters_text_player_field_matches_name_only", () => {
    const rows = [
      row({ name: "Marcos Llorente", seller: "Marcos FC" }),
      row({ id: "2", name: "Unai Simón" }),
    ];
    const filters = withFilters({ text: "llor", field: "player" });
    expect(applyMarketFilters(rows, filters).map((entry) => entry.name)).toEqual([
      "Marcos Llorente",
    ]);
  });

  it("applyMarketFilters_text_seller_field_matches_seller_only", () => {
    const rows = [
      row({ name: "P1", seller: "Rival Manager" }),
      row({ id: "2", name: "P2", seller: "LaLiga" }),
    ];
    const filters = withFilters({ text: "rival", field: "seller" });
    expect(applyMarketFilters(rows, filters).map((entry) => entry.name)).toEqual(["P1"]);
  });

  it("applyMarketFilters_text_team_field_matches_team_name", () => {
    const rows = [
      row({ name: "P1", teamName: "Atlético de Madrid" }),
      row({ id: "2", name: "P2", teamName: "Athletic Club" }),
    ];
    const filters = withFilters({ text: "atletico", field: "team" });
    expect(applyMarketFilters(rows, filters).map((entry) => entry.name)).toEqual(["P1"]);
  });

  it("applyMarketFilters_text_all_field_checks_player_seller_and_team", () => {
    const rows = [
      row({ name: "Hidden", seller: "LaLiga", teamName: "Sevilla" }),
      row({ id: "2", name: "Star", seller: "Sevilla Fan", teamName: "Other" }),
    ];
    const filters = withFilters({ text: "sevilla", field: "all" });
    expect(applyMarketFilters(rows, filters)).toHaveLength(2);
  });

  it("applyMarketFilters_text_ignores_accents_and_case", () => {
    const rows = [row({ name: "Álvaro Núñez" }), row({ id: "2", name: "Yuri" })];
    const filters = withFilters({ text: "nunez", field: "player" });
    expect(applyMarketFilters(rows, filters).map((entry) => entry.name)).toEqual([
      "Álvaro Núñez",
    ]);
    expect(
      applyMarketFilters(rows, withFilters({ text: "ÁLVARO", field: "player" })).map(
        (entry) => entry.name,
      ),
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

  it("applyMarketFilters_combined_filters_use_and_logic", () => {
    const rows = [
      row({ id: "a", name: "Laporte", marketValue: 500 }),
      row({ id: "b", name: "Laporte Jr", marketValue: 100 }),
      row({ id: "c", name: "Other", marketValue: 500 }),
    ];
    const filters = withFilters({
      text: "laporte",
      field: "player",
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
      text: "x",
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
