import { describe, expect, it } from "vitest";

import {
  formDisplayPoints,
  formFromCalendarWeeks,
  formPoints,
  formRecentPoints,
  formRecentWeekNumbers,
  marketDisplayName,
  marketRow,
  recentFormWeekNumbers,
} from "./marketRows";

describe("marketDisplayName", () => {
  it("marketDisplayName_appends_coach_label_for_position_five", () => {
    expect(marketDisplayName("Luís Castro", null, 5)).toBe("Luís Castro (Coach)");
    expect(marketDisplayName(null, "Full Name", 4)).toBe("Full Name");
  });
});

describe("form helpers", () => {
  it("formPoints_sums_last_five_matchweeks", () => {
    const lastStats = [
      { weekNumber: 3, totalPoints: 2 },
      { weekNumber: 7, totalPoints: 8 },
      { weekNumber: 6, totalPoints: 4 },
    ];
    expect(formPoints(lastStats)).toBe(14);
    expect(formRecentPoints(lastStats)).toEqual([8, 4, 2]);
  });

  it("formPoints_accepts_weekPoints_alias", () => {
    expect(formPoints([{ weekNumber: 5, weekPoints: 11 }])).toBe(11);
  });

  it("formDisplayPoints_keeps_newest_three_scores", () => {
    expect(formDisplayPoints([8, 4, 2, 1, 0])).toEqual([8, 4, 2]);
  });

  it("formRecentWeekNumbers_aligns_with_newest_three_matchweeks", () => {
    const lastStats = [
      { weekNumber: 3, totalPoints: 2 },
      { weekNumber: 7, totalPoints: 8 },
      { weekNumber: 6, totalPoints: 4 },
    ];
    expect(formRecentWeekNumbers(lastStats)).toEqual([7, 6, 3]);
  });

  it("recentFormWeekNumbers_stops_at_one", () => {
    expect(recentFormWeekNumbers(3)).toEqual([3, 2, 1]);
    expect(recentFormWeekNumbers(8, 5)).toEqual([8, 7, 6, 5, 4]);
  });

  it("formFromCalendarWeeks_fills_missing_weeks_with_zero", () => {
    const statsByWeek = new Map<number, Map<string, number>>([
      [7, new Map([["42", 6]])],
      [6, new Map([["42", 0]])],
    ]);
    const result = formFromCalendarWeeks("42", [7, 6, 5], statsByWeek);
    expect(result.formRecent).toEqual([6, 0, 0]);
    expect(result.form).toBe(6);
  });

  it("marketRow_uses_calendar_form_when_lastStats_missing", () => {
    const statsByWeek = new Map<number, Map<string, number>>([
      [7, new Map([["9", 3]])],
      [6, new Map([["9", 5]])],
    ]);
    const row = marketRow(
      { id: "m1", playerMaster: { id: "9", nickname: "A", positionId: 4 } },
      0,
      new Map(),
      new Map(),
      new Map(),
      { weekNumbers: [7, 6], statsByWeek },
    );
    expect(row.form).toBe(8);
    expect(row.formRecent).toEqual([3, 5]);
    expect(row.formRecentWeeks).toEqual([7, 6]);
  });

  it("marketRow_labels_coaches_in_the_name", () => {
    const row = marketRow(
      { id: "m1", playerMaster: { id: "2877", nickname: "Luís Castro", positionId: 5 } },
      0,
      new Map(),
      new Map(),
    );
    expect(row.name).toBe("Luís Castro (Coach)");
  });
});
