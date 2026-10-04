import { describe, expect, it } from "vitest";

import {
  MAX_LISTING_PRICE,
  immediateSalePrice,
  isValidListingPrice,
  minimumListingPrice,
} from "./squadSale";

// ---- Happy path ---- //

describe("squadSale", () => {
  it("minimumListingPrice_rounds_up_to_a_whole_euro", () => {
    expect(minimumListingPrice(1_250_000.2)).toBe(1_250_001);
    expect(minimumListingPrice(8_000_000)).toBe(8_000_000);
  });

  it("immediateSalePrice_is_half_rounded_down", () => {
    expect(immediateSalePrice(8_000_001)).toBe(4_000_000);
    expect(immediateSalePrice(10)).toBe(5);
  });

  it("isValidListingPrice_accepts_market_value_through_the_cap", () => {
    expect(isValidListingPrice(5_000_000, 5_000_000)).toBe(true);
    expect(isValidListingPrice(MAX_LISTING_PRICE, 5_000_000)).toBe(true);
  });

  // ---- Error paths ---- //

  it("isValidListingPrice_rejects_below_market_value_and_above_cap", () => {
    expect(isValidListingPrice(4_999_999, 5_000_000)).toBe(false);
    expect(isValidListingPrice(MAX_LISTING_PRICE + 1, 5_000_000)).toBe(false);
  });

  // ---- Edge cases ---- //

  it("minimumListingPrice_missing_or_non_positive_returns_null", () => {
    expect(minimumListingPrice(null)).toBeNull();
    expect(minimumListingPrice(0)).toBeNull();
    expect(immediateSalePrice(1)).toBeNull();
  });
});
