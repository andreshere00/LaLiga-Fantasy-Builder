import { describe, expect, it } from "vitest";

import type { MarketRow } from "./model/row";
import { filterMarketRowsBySearch } from "./marketSearch";

function row(name: string): MarketRow {
  return {
    id: name,
    marketId: name,
    playerId: null,
    playerTeamId: null,
    name,
    positionId: null,
    photoUrl: null,
    teamBadgeUrl: null,
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
  };
}

describe("filterMarketRowsBySearch", () => {
  it("filterMarketRowsBySearch_empty_query_returns_all_rows", () => {
    const rows = [row("Laporte"), row("Yuri")];
    expect(filterMarketRowsBySearch(rows, "")).toEqual(rows);
  });

  it("filterMarketRowsBySearch_matches_substring_case_insensitive", () => {
    const rows = [row("Marcos Llorente"), row("Unai Simón")];
    expect(filterMarketRowsBySearch(rows, "llor").map((entry) => entry.name)).toEqual([
      "Marcos Llorente",
    ]);
  });

  it("filterMarketRowsBySearch_ignores_accents_in_query_and_name", () => {
    const rows = [row("Álvaro Núñez"), row("Yuri")];
    expect(filterMarketRowsBySearch(rows, "nunez").map((entry) => entry.name)).toEqual([
      "Álvaro Núñez",
    ]);
    expect(filterMarketRowsBySearch(rows, "ÁLVARO").map((entry) => entry.name)).toEqual([
      "Álvaro Núñez",
    ]);
  });
});
