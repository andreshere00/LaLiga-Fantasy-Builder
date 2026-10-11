import { describe, expect, it } from "vitest";

import { clubDisplayName } from "./clubNames";

// ---- Happy path ---- #

describe("clubDisplayName", () => {
  it("clubDisplayName_code_returnsDisplayName", () => {
    expect(clubDisplayName("LEV")).toBe("Levante");
    expect(clubDisplayName("BAR")).toBe("Barcelona");
  });

  it("clubDisplayName_fullName_staysUnchanged", () => {
    expect(clubDisplayName("Getafe")).toBe("Getafe");
  });
});

// ---- Edge cases ---- #

describe("clubDisplayName_blank", () => {
  it("clubDisplayName_empty_returnsNull", () => {
    expect(clubDisplayName("  ")).toBeNull();
  });
});
