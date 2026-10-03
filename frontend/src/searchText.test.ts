import { describe, expect, it } from "vitest";

import { normalizeSearchText } from "./searchText";

describe("normalizeSearchText", () => {
  it("normalizeSearchText_strips_accents_and_lowercases", () => {
    expect(normalizeSearchText("  Álvaro Núñez  ")).toBe("alvaro nunez");
    expect(normalizeSearchText("José")).toBe("jose");
  });
});
