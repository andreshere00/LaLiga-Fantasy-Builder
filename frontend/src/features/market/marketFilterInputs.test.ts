// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import {
  digitsOnlyMarketValueInput,
  formatMarketValueFilterInput,
  MARKET_VALUE_FILTER_MAX,
  MARKET_VALUE_FILTER_MIN,
  parseMarketValueFilterBound,
  parseStatFilterBound,
  stepMarketValueFilterBound,
  stepStatFilterBound,
} from "./marketFilterInputs";

// ---- Happy path ---- //

describe("market value filter input", () => {
  it("digitsOnlyMarketValueInput_strips_non_digits_and_dots", () => {
    expect(digitsOnlyMarketValueInput("12.abc-3,5")).toBe("1235");
  });

  it("formatMarketValueFilterInput_groups_thousands_without_decimals", () => {
    expect(formatMarketValueFilterInput("1000000")).toBe("1.000.000");
  });

  it("parseMarketValueFilterBound_clamps_to_euro_range", () => {
    expect(parseMarketValueFilterBound("500")).toBe(MARKET_VALUE_FILTER_MIN);
    expect(parseMarketValueFilterBound("2.000.000")).toBe(MARKET_VALUE_FILTER_MAX);
    expect(parseMarketValueFilterBound("739.427")).toBe(739_427);
  });

  it("parseMarketValueFilterBound_empty_clears_bound", () => {
    expect(parseMarketValueFilterBound("")).toBeNull();
    expect(parseMarketValueFilterBound("   ")).toBeNull();
  });

  it("stepMarketValueFilterBound_steps_by_thousands_within_range", () => {
    expect(stepMarketValueFilterBound(null, 1)).toBe(MARKET_VALUE_FILTER_MIN);
    expect(stepMarketValueFilterBound(null, -1)).toBeNull();
    expect(stepMarketValueFilterBound(739_427, 1)).toBe(740_427);
    expect(stepMarketValueFilterBound(739_427, -1)).toBe(738_427);
    expect(stepMarketValueFilterBound(MARKET_VALUE_FILTER_MAX, 1)).toBe(
      MARKET_VALUE_FILTER_MAX,
    );
    expect(stepMarketValueFilterBound(MARKET_VALUE_FILTER_MIN, -1)).toBe(
      MARKET_VALUE_FILTER_MIN,
    );
  });
});

describe("stat filter input", () => {
  it("parseStatFilterBound_rejects_non_numeric_and_negative", () => {
    expect(parseStatFilterBound("12a")).toBe(12);
    expect(parseStatFilterBound("-5")).toBe(5);
  });

  it("stepStatFilterBound_steps_by_one_from_zero", () => {
    expect(stepStatFilterBound(null, 1)).toBe(0);
    expect(stepStatFilterBound(5, 1)).toBe(6);
    expect(stepStatFilterBound(0, -1)).toBe(0);
  });
});
