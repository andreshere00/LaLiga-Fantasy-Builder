// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import { allFormationCounts } from "./formations";
import { MAX_PLAYERS_PER_LINE, pitchRowGapFraction, pitchRows } from "./pitchLayout";

function players(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

// ---- Happy path ---- //

describe("pitchRows", () => {
  it("pitchRows_one_to_four_players_stays_on_one_row", () => {
    expect(pitchRows(players(1), "defender")).toEqual([[0]]);
    expect(pitchRows(players(4), "midfield")).toEqual([[0, 1, 2, 3]]);
  });

  it("pitchRows_five_and_six_players_stay_on_one_row", () => {
    expect(pitchRows(players(5), "defender")).toEqual([[0, 1, 2, 3, 4]]);
    expect(pitchRows(players(6), "midfield")).toEqual([[0, 1, 2, 3, 4, 5]]);
  });

  it("pitchRows_goalkeeper_keeps_a_single_player", () => {
    expect(pitchRows(players(3), "goalkeeper")).toEqual([[0]]);
  });

  it("pitchRows_every_listed_formation_fits_the_row_rules", () => {
    for (const [defenders, midfielders, strikers] of allFormationCounts()) {
      expect(defenders).toBeGreaterThanOrEqual(0);
      expect(defenders).toBeLessThanOrEqual(MAX_PLAYERS_PER_LINE);
      expect(midfielders).toBeLessThanOrEqual(MAX_PLAYERS_PER_LINE);
      expect(strikers).toBeLessThanOrEqual(MAX_PLAYERS_PER_LINE);
      expect(pitchRows(players(defenders), "defender").length).toBe(1);
      expect(pitchRows(players(midfielders), "midfield").length).toBe(1);
      if (strikers === 0) {
        expect(pitchRows(players(strikers), "striker")).toEqual([]);
      } else {
        expect(pitchRows(players(strikers), "striker").length).toBe(1);
      }
      expect(pitchRows(players(1), "goalkeeper")).toEqual([[0]]);
    }
  });
});

// ---- Edge cases ---- //

describe("pitchRows edge cases", () => {
  it("pitchRows_empty_line_returns_no_rows", () => {
    expect(pitchRows([], "striker")).toEqual([]);
  });

  it("pitchRows_more_than_six_players_drops_the_extra", () => {
    const rows = pitchRows(players(8), "midfield");
    expect(rows.flat()).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("pitchRowGapFraction", () => {
  it("pitchRowGapFraction_is_one_fortieth_of_pitch_width", () => {
    expect(pitchRowGapFraction(4)).toBe(0.025);
    expect(pitchRowGapFraction(6)).toBe(0.025);
  });
});
