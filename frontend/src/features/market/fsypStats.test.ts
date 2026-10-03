import { describe, expect, it } from "vitest";

import { averageLastPerformances } from "./fsypStats";

describe("averageLastPerformances", () => {
  it("averageLastPerformances_mean_of_newest_three", () => {
    expect(averageLastPerformances([6, 4, 2, 0])).toBe(4);
  });

  it("averageLastPerformances_returns_null_when_empty", () => {
    expect(averageLastPerformances([])).toBe(null);
  });
});
