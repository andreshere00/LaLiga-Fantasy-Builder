import { describe, expect, it } from "vitest";

import { highlightedAverages, playerAverages, remainingAverages } from "./playerAverages";

describe("player averages", () => {
  it("playerAverages_prefersSeasonTotalsAndAveragesOnlyPlayedFantasyWeeks", () => {
    const averages = playerAverages(
      [{ code: "G", label: "Goals", value: 1.25 }],
      {
        lastStats: [
          {
            weekNumber: 1,
            totalPoints: 8,
            stats: { mins_played: [90, 2], goals: [2, 12], saves: [4, 2] },
          },
          {
            weekNumber: 2,
            totalPoints: 0,
            stats: { mins_played: [0, 0], goals: [0, 0], saves: [0, 0] },
          },
          {
            weekNumber: 3,
            totalPoints: 4,
            stats: { mins_played: [70, 2], goals: [0, 0], saves: [6, 3] },
          },
        ],
      },
    );

    expect(averages.find((row) => row.code === "G")).toMatchObject({
      value: 1.25,
      source: "futbolfantasy",
    });
    expect(averages.find((row) => row.code === "S")).toMatchObject({
      value: 5,
      source: "fantasy",
      sampleSize: 2,
    });
    expect(averages.find((row) => row.code === "PI")?.value).toBeNull();
  });

  it("highlightedAverages_selectsGoalkeeperMetricsAndHidesTheRestUntilDetails", () => {
    const averages = playerAverages([], null);
    const highlighted = highlightedAverages(averages, 1);
    const remaining = remainingAverages(averages, highlighted);

    expect(highlighted.map((row) => row.code)).toEqual(["DE", "PI", "BR", "-Pos", "S", "GC"]);
    expect(remaining.some((row) => row.code === "G")).toBe(true);
    expect(remaining.some((row) => row.code === "S")).toBe(false);
  });
});
