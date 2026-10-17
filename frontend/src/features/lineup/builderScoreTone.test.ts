import { describe, expect, it } from "vitest";
import { builderScoreTone, type BuilderScoreAxis, type BuilderScoreTone } from "./builderScoreTone";

describe("builderScoreTone", () => {
  it.each<[BuilderScoreAxis, number, BuilderScoreTone]>([
    ["lineup", -0.001, "red"], ["lineup", 0, "yellow"],
    ["lineup", 0.25, "yellow"], ["lineup", 0.275, "yellow"],
    ["lineup", 0.2999, "yellow"], ["lineup", 0.3, "green"],
    ["lineup", 0.5, "green"], ["lineup", 0.5001, "purple"],
    ["trading", -1, "red"], ["trading", -0.2501, "red"],
    ["trading", -0.25, "yellow"], ["trading", -0.001, "yellow"],
    ["trading", 0, "green"], ["trading", 0.5, "green"],
    ["trading", 0.5001, "purple"],
    ["combined", -0.001, "red"], ["combined", 0, "yellow"],
    ["combined", 0.5999, "yellow"], ["combined", 0.6, "green"],
    ["combined", 1.1999, "green"], ["combined", 1.2, "purple"],
  ])("should color %s score %s as %s at the threshold", (axis, score, expected) => {
    expect(builderScoreTone(score, axis)).toBe(expected);
  });
});
