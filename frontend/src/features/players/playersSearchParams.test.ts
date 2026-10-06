import { describe, expect, it } from "vitest";

import {
  createEmptyPlayersFilters,
  isPlayersLeaderboardView,
  parsePlayersSearchParams,
  serializePlayersSearchParams,
  withPlayersFilters,
  withPlayersPage,
} from "./playersSearchParams";

// ---- Mocks, fixtures & helpers ---- #

// ---- Happy path ---- #

describe("parsePlayersSearchParams_emptyParams_leaderboardMode", () => {
  it("defaults to leaderboard with no page", () => {
    const state = parsePlayersSearchParams(new URLSearchParams());
    expect(isPlayersLeaderboardView(state.filters)).toBe(true);
    expect(state.page).toBeNull();
  });
});

describe("serializePlayersSearchParams_filteredPageTwo_includesPage", () => {
  it("includes page when filtered", () => {
    const filters = createEmptyPlayersFilters();
    filters.query = "messi";
    const params = serializePlayersSearchParams({ filters, page: 2 });
    expect(params.get("q")).toBe("messi");
    expect(params.get("page")).toBe("2");
  });
});

describe("parsePlayersSearchParams_fullQuery_roundTrips", () => {
  it("round trips canonical params", () => {
    const filters = createEmptyPlayersFilters();
    filters.query = "vin";
    filters.availability = new Set(["available"]);
    const serialized = serializePlayersSearchParams({ filters, page: null });
    const parsed = parsePlayersSearchParams(serialized);
    expect(parsed.filters.query).toBe("vin");
    expect(parsed.filters.availability.has("available")).toBe(true);
  });
});

// ---- Error paths ---- #

describe("parsePlayersSearchParams_invalidPage_ignored", () => {
  it("drops invalid page", () => {
    const state = parsePlayersSearchParams(new URLSearchParams("q=test&page=abc"));
    expect(state.page).toBeNull();
  });
});

// ---- Edge cases ---- #

describe("withPlayersFilters_patch_resetsPage", () => {
  it("removes page when filters change", () => {
    const base = new URLSearchParams("q=a&page=3");
    const next = withPlayersFilters(base, { owner: "Boss" });
    expect(next.get("page")).toBeNull();
    expect(next.get("owner")).toBe("Boss");
  });
});

describe("withPlayersPage_filtered_increments", () => {
  it("sets page in filtered mode", () => {
    const base = new URLSearchParams("q=test");
    const next = withPlayersPage(base, 2);
    expect(next.get("page")).toBe("2");
  });
});
