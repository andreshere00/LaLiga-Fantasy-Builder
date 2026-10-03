import { describe, expect, it } from "vitest";

import { formatIntegerAmount, parseIntegerAmount } from "./format";

describe("formatIntegerAmount", () => {
  it("formatIntegerAmount_groups_thousands_in_es_es", () => {
    expect(formatIntegerAmount(739_427)).toBe("739.427");
    expect(formatIntegerAmount(20_883_493)).toBe("20.883.493");
  });
});

describe("parseIntegerAmount", () => {
  it("parseIntegerAmount_reads_grouped_es_es_input", () => {
    expect(parseIntegerAmount("739.427")).toBe(739_427);
    expect(parseIntegerAmount("20.883.493")).toBe(20_883_493);
    expect(parseIntegerAmount("739427")).toBe(739_427);
  });

  it("parseIntegerAmount_returns_null_for_empty_or_invalid", () => {
    expect(parseIntegerAmount("")).toBe(null);
    expect(parseIntegerAmount("abc")).toBe(null);
  });
});
