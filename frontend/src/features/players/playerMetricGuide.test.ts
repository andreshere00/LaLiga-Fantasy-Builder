import { describe, expect, it } from "vitest";
import type { PlayerAverage } from "./playerAverages";
import { seasonMetricShare } from "./playerMetricGuide";

function metric(code: string, value: number | null, source: PlayerAverage["source"] = "futbolfantasy"): PlayerAverage {
  return { code, label: code, value, source, sampleSize: source === "fantasy" ? 3 : null };
}

describe("season event shares", () => {
  it("expresses the on-target subset relative to all shots, not goals or a benchmark", () => {
    expect(seasonMetricShare([metric("T", 5.33), metric("TaP", 1.78)], "TaP", "T"))
      .toEqual({ part: 1.78, total: 5.33, percent: 33 });
  });
  it("preserves a recorded zero numerator", () => {
    expect(seasonMetricShare([metric("T", 5), metric("TaP", 0)], "TaP", "T")?.percent).toBe(0);
  });
  it.each([null, 0, -1])("omits shares with missing or unusable attempt counts: %s", (total) => {
    expect(seasonMetricShare([metric("T", total), metric("TaP", 1)], "TaP", "T")).toBeNull();
  });
  it("does not manufacture zero when a subset is missing or larger than its total", () => {
    expect(seasonMetricShare([metric("T", 5), metric("TaP", null)], "TaP", "T")).toBeNull();
    expect(seasonMetricShare([metric("T", 5), metric("TaP", 6)], "TaP", "T")).toBeNull();
  });
  it("does not combine different sources or assume equally sized fallback samples share matchweeks", () => {
    expect(seasonMetricShare([metric("T", 5), metric("TaP", 1, "fantasy")], "TaP", "T")).toBeNull();
    expect(seasonMetricShare([metric("T", 5, "fantasy"), metric("TaP", 1, "fantasy")], "TaP", "T")).toBeNull();
  });
});
