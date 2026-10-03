import { describe, expect, it } from "vitest";

import { clauseUnlockCountdown, isSealEndUnderOneHour, ONE_HOUR_MS } from "./valueSeries";

describe("isSealEndUnderOneHour", () => {
  const now = Date.parse("2026-06-01T12:00:00Z");

  it("isSealEndUnderOneHour_true_when_less_than_one_hour_remains", () => {
    expect(isSealEndUnderOneHour(now + 59 * 60_000, now)).toBe(true);
  });

  it("isSealEndUnderOneHour_false_when_at_least_one_hour_remains", () => {
    expect(isSealEndUnderOneHour(now + ONE_HOUR_MS, now)).toBe(false);
  });

  it("isSealEndUnderOneHour_false_when_expiry_unknown", () => {
    expect(isSealEndUnderOneHour(null, now)).toBe(false);
  });
});

describe("clauseUnlockCountdown", () => {
  const now = Date.parse("2026-06-01T12:00:00Z");

  it("clauseUnlockCountdown_future_unlock_returns_days_hours_minutes", () => {
    const unlockAt = now + (2 * 1_440 + 3 * 60 + 5) * 60_000;
    expect(clauseUnlockCountdown(unlockAt, now)).toBe("2 days 3 hours 5 minutes");
  });

  it("clauseUnlockCountdown_singular_units_are_not_pluralised", () => {
    expect(clauseUnlockCountdown(now + (1_440 + 60 + 1) * 60_000, now)).toBe(
      "1 day 1 hour 1 minute",
    );
  });

  it("clauseUnlockCountdown_already_unlocked_returns_null", () => {
    expect(clauseUnlockCountdown(now - 1, now)).toBeNull();
    expect(clauseUnlockCountdown(null, now)).toBeNull();
  });
});
