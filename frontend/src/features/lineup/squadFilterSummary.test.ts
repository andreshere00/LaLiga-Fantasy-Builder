import { describe, expect, it } from "vitest";
import { clearSquadFilter, createEmptySquadFilters, type SquadFilters } from "./squadFilters";
import { activeSquadFilterChips } from "./squadFilterSummary";

function filters(overrides: Partial<SquadFilters>): SquadFilters {
  return { ...createEmptySquadFilters(), ...overrides };
}

describe("activeSquadFilterChips", () => {
  it("activeSquadFilterChips_noFilters_returnsNoChips", () => {
    expect(activeSquadFilterChips(createEmptySquadFilters())).toEqual([]);
  });

  it("activeSquadFilterChips_severalGroups_followsDialogOrderWithValues", () => {
    const chips = activeSquadFilterChips(filters({
      clubs: new Set(["Villarreal CF", "FC Barcelona"]),
      positions: new Set([1]),
      points: { min: 50, max: null },
    }));

    expect(chips).toEqual([
      { key: "positions", label: "Position", value: "Goalkeeper" },
      { key: "points", label: "FSYP", value: "50+ pts" },
      { key: "clubs", label: "Club", value: "FC Barcelona, Villarreal CF" },
    ]);
  });
});

describe("clearSquadFilter", () => {
  it("clearSquadFilter_oneGroup_resetsOnlyThatGroup", () => {
    const current = filters({ positions: new Set([1]), minStarterProbability: 60 });

    const next = clearSquadFilter(current, "minStarterProbability");

    expect(next.minStarterProbability).toBe(0);
    expect([...next.positions]).toEqual([1]);
    expect(current.minStarterProbability).toBe(60);
  });
});
