import { describe, expect, it } from "vitest";
import { formAverageLastThree, playerFormHistory } from "./form";

describe("playerFormHistory", () => {
  it("includes zero scores and missing played weeks in the history and average", () => {
    const history = playerFormHistory("p1", [
      { weekNumber: 5, totalPoints: 6 },
      { weekNumber: 3, totalPoints: 0 },
      { weekNumber: 1, totalPoints: 2 },
    ]);

    expect(history.weeks).toEqual([5, 4, 3, 2, 1]);
    expect(history.recent).toEqual([6, 0, 0, 0, 2]);
    expect(formAverageLastThree(history.recent)).toBe(2);
  });

  it("keeps the scheduled current fixture separate from played zero scores", () => {
    const history = playerFormHistory("p1", [{ weekNumber: 3, totalPoints: 9 }], {
      playedThrough: 3,
      currentWeek: 4,
      weekNumbers: [4, 3, 2, 1],
      statsByWeek: new Map(),
      pendingByWeek: new Map([[4, new Set(["p1"])]]),
    });

    expect(history.weeks).toEqual([3, 2, 1]);
    expect(history.recent).toEqual([9, 0, 0]);
    expect(history.pendingFormWeek).toBe(4);
    expect(formAverageLastThree(history.recent)).toBe(3);
  });
});
