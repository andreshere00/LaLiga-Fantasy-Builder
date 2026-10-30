import { describe, expect, it } from "vitest";
import { starterProbabilityTone } from "./starterProbability";

describe("starterProbabilityTone", () => {
  it.each([
    [0, "low"], [49.99, "low"], [50, "mid"], [74.99, "mid"], [75, "high"], [100, "high"],
    [null, null], [undefined, null], [-1, null], [101, null], [NaN, null],
  ] as const)("classifies %s using profile thresholds as %s", (percent, expected) => {
    expect(starterProbabilityTone(percent)).toBe(expected);
  });
});
