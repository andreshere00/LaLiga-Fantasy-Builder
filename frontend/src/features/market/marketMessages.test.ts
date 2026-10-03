import { describe, expect, it } from "vitest";

import { COACH_HIRE_PREMIUM_MESSAGE, isCoachMarketHire } from "./marketMessages";
import { COACH_POSITION_ID } from "./positions";

describe("isCoachMarketHire", () => {
  it("isCoachMarketHire_true_for_hire_on_coach_position", () => {
    expect(isCoachMarketHire(COACH_POSITION_ID, "hire")).toBe(true);
  });

  it("isCoachMarketHire_false_for_purchase_on_coach_position", () => {
    expect(isCoachMarketHire(COACH_POSITION_ID, "purchase")).toBe(false);
  });
});

describe("COACH_HIRE_PREMIUM_MESSAGE", () => {
  it("COACH_HIRE_PREMIUM_MESSAGE_mentions_premium", () => {
    expect(COACH_HIRE_PREMIUM_MESSAGE.toLowerCase()).toContain("premium");
  });
});
