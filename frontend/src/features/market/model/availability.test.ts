import { describe, expect, it } from "vitest";

import { AVAILABILITY_TOOLTIPS, availabilityOf } from "./availability";

describe("availabilityOf", () => {
  it("availabilityOf_maps_fantasy_status_strings", () => {
    expect(availabilityOf("ok")).toBe("available");
    expect(availabilityOf("doubtful")).toBe("questionable");
    expect(availabilityOf("injured")).toBe("unavailable");
  });
});

describe("AVAILABILITY_TOOLTIPS", () => {
  it("AVAILABILITY_TOOLTIPS_covers_every_state", () => {
    expect(AVAILABILITY_TOOLTIPS.available).toContain("next matchday");
    expect(AVAILABILITY_TOOLTIPS.questionable).toContain("may not");
    expect(AVAILABILITY_TOOLTIPS.unavailable).toContain("cannot");
  });
});
