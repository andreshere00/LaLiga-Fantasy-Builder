// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import { DEFAULT_FREE_FORMATION_CODES, formationSelectOptions } from "./formations";

// ---- Happy path ---- //

describe("formationSelectOptions", () => {
  it("formationSelectOptions_includes_current_code_when_missing", () => {
    const options = formationSelectOptions(DEFAULT_FREE_FORMATION_CODES, "5,2,3");
    expect(options[0]).toEqual({ value: "5,2,3", label: "5-2-3" });
    expect(options.filter((option) => option.value === "5,2,3")).toHaveLength(1);
  });

  it("formationSelectOptions_keeps_listed_code_in_place", () => {
    expect(formationSelectOptions(["4,4,2"], "4,4,2")).toEqual([
      { value: "4,4,2", label: "4-4-2" },
    ]);
  });
});
