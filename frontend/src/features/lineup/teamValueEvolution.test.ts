import { describe, expect, it } from "vitest";

import { DAY_MS } from "../market/model/valueSeries";
import { teamValueEvolutionSnapshot } from "./teamValueEvolution";

describe("teamValueEvolutionSnapshot", () => {
  it("teamValueEvolutionSnapshot_sums_squad_histories_at_each_lookback", () => {
    const base = Date.parse("2026-01-15T12:00:00Z");
    const histories = [
      [
        { time: base - 10 * DAY_MS, value: 80 },
        { time: base, value: 100 },
      ],
      [
        { time: base - 10 * DAY_MS, value: 40 },
        { time: base, value: 60 },
      ],
    ];
    const snapshot = teamValueEvolutionSnapshot(histories, 160);
    expect(snapshot.today).toBe(160);
    expect(snapshot.fiveDaysAgo).toBe(120);
  });

  it("teamValueEvolutionSnapshot_missing_history_yields_null_lookbacks", () => {
    const snapshot = teamValueEvolutionSnapshot([[]], 200);
    expect(snapshot.today).toBe(200);
    expect(snapshot.thirtyDaysAgo).toBeNull();
  });

  it("teamValueEvolutionSnapshot_short_series_yields_null_for_unreachable_lookback", () => {
    const base = Date.parse("2026-01-15T12:00:00Z");
    const histories = [[{ time: base - 2 * DAY_MS, value: 100 }]];
    const snapshot = teamValueEvolutionSnapshot(histories, 100);
    expect(snapshot.today).toBe(100);
    expect(snapshot.fiveDaysAgo).toBeNull();
  });
});
