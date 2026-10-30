// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import {
  activeSquadFilterCount,
  applySquadFilters,
  createEmptySquadFilters,
  squadPointsBounds,
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
    filters.minStarterProbability = 75;
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

  it("applySquadFilters_keeps_players_at_exact_minimum_probability", () => {
    const filters = createEmptySquadFilters();
    filters.minStarterProbability = 80;
    const rows = [player({ id: "equal" }), player({ id: "below", starterProbability: 75 })];

    expect(applySquadFilters(rows, filters, false).map((row) => row.id)).toEqual(["equal"]);
  });

  it("activeSquadFilterCount_zero_probability_is_inactive", () => {
    const filters = createEmptySquadFilters();
    filters.minStarterProbability = 0;

    expect(activeSquadFilterCount(filters)).toBe(0);
  });

  it("squadPointsBounds_ignores_unknown_points", () => {
    const rows = [player({ points: 12 }), player({ points: null }), player({ points: -3 })];

    expect(squadPointsBounds(rows)).toEqual({ min: -3, max: 12 });
    expect(squadPointsBounds([player({ points: null })])).toBeNull();
  });
});
