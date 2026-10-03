import { describe, expect, it } from "vitest";

import {
  formatMarketValueWithChange,
  marketValueAtDaysAgo,
  marketValueSnapshot,
  relativeChangePercent,
} from "./marketValueStats";
import type { ValuePoint } from "./model/valueSeries";
import { DAY_MS } from "./model/valueSeries";

function series(entries: { dayOffset: number; value: number }[]): ValuePoint[] {
  const base = Date.parse("2026-01-15T12:00:00Z");
  return entries.map(({ dayOffset, value }) => ({
    time: base + dayOffset * DAY_MS,
    value,
  }));
}

describe("marketValueAtDaysAgo", () => {
  it("marketValueAtDaysAgo_uses_last_point_on_or_before_cutoff", () => {
    const points = series([
      { dayOffset: 0, value: 100 },
      { dayOffset: 3, value: 110 },
      { dayOffset: 10, value: 120 },
    ]);
    expect(marketValueAtDaysAgo(points, 5)).toBe(110);
    expect(marketValueAtDaysAgo(points, 14)).toBe(100);
  });
});

describe("marketValueSnapshot", () => {
  it("marketValueSnapshot_computes_extrema_and_lagged_values", () => {
    const points = series([
      { dayOffset: 0, value: 100 },
      { dayOffset: 6, value: 150 },
      { dayOffset: 12, value: 80 },
      { dayOffset: 20, value: 130 },
    ]);
    const snapshot = marketValueSnapshot(points);
    expect(snapshot.last).toBe(130);
    expect(snapshot.best).toBe(150);
    expect(snapshot.lowest).toBe(80);
    expect(snapshot.fiveDaysAgo).toBe(80);
    expect(snapshot.fourteenDaysAgo).toBe(150);
  });

  it("marketValueSnapshot_falls_back_to_catalog_last_when_series_empty", () => {
    expect(marketValueSnapshot([], 500_000)).toEqual({
      last: 500_000,
      best: null,
      lowest: null,
      fiveDaysAgo: null,
      fourteenDaysAgo: null,
    });
  });
});

describe("relativeChangePercent", () => {
  it("relativeChangePercent_current_below_reference_returns_negative", () => {
    expect(relativeChangePercent(80, 100)).toBe(-20);
  });

  it("relativeChangePercent_zero_reference_returns_null", () => {
    expect(relativeChangePercent(80, 0)).toBeNull();
  });
});

describe("formatMarketValueWithChange", () => {
  it("formatMarketValueWithChange_missing_reference_returns_dash", () => {
    expect(formatMarketValueWithChange(null, 100)).toBe("—");
  });
});
