// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import {
  activeSquadFilterCount,
  applySquadFilters,
  createEmptySquadFilters,
  squadRangeInvalid,
  type SquadFilterPlayer,
} from "./squadFilters";

function player(overrides: Partial<SquadFilterPlayer> = {}): SquadFilterPlayer {
  return {
    id: "1",
    positionId: 4,
    points: 40,
    club: "Barcelona",
    starterProbability: 80,
    form: "Good",
    availability: "available",
    ...overrides,
  };
}

// ---- Happy path ---- //

describe("applySquadFilters", () => {
  it("applySquadFilters_keeps_players_matching_every_condition", () => {
    const filters = createEmptySquadFilters();
    filters.positions = new Set([4]);
    filters.points = { min: 20, max: 50 };
    filters.clubs = new Set(["Barcelona"]);
    filters.starterProbability = { min: 75, max: null };
    filters.forms = new Set(["Good"]);
    filters.availability = new Set(["available"]);
    const rows = [
      player(),
      player({ id: "2", positionId: 2 }),
      player({ id: "3", points: 10 }),
      player({ id: "4", club: "Sevilla" }),
      player({ id: "5", starterProbability: 40 }),
      player({ id: "6", form: "Poor" }),
      player({ id: "7", availability: "unavailable" }),
    ];

    expect(applySquadFilters(rows, filters, false).map((row) => row.id)).toEqual(["1"]);
    expect(activeSquadFilterCount(filters)).toBe(6);
  });

  // ---- Error paths ---- //

  it("applySquadFilters_excludes_unknown_values_after_loading", () => {
    const filters = createEmptySquadFilters();
    filters.forms = new Set(["Good"]);
    const rows = [player({ id: "known" }), player({ id: "missing", form: null })];

    expect(applySquadFilters(rows, filters, true).map((row) => row.id))
      .toEqual(["known", "missing"]);
    expect(applySquadFilters(rows, filters, false).map((row) => row.id)).toEqual(["known"]);
  });

  // ---- Edge cases ---- //

  it("squadRangeInvalid_requires_both_bounds", () => {
    expect(squadRangeInvalid({ min: 10, max: 4 })).toBe(true);
    expect(squadRangeInvalid({ min: 4, max: 10 })).toBe(false);
    expect(squadRangeInvalid({ min: null, max: 4 })).toBe(false);
  });
});
