import { DAY_MS } from "../market/model/valueSeries";
import type { ValuePoint } from "../market/model/valueSeries";

export type TeamValueEvolutionSnapshot = {
  today: number | null;
  yesterday: number | null;
  fiveDaysAgo: number | null;
  fourteenDaysAgo: number | null;
  thirtyDaysAgo: number | null;
};

/** Value at or before the cutoff; null when the series does not reach that window. */
function strictValueAtDaysAgo(series: readonly ValuePoint[], days: number): number | null {
  if (series.length === 0) return null;
  const latest = series[series.length - 1];
  const cutoff = latest.time - days * DAY_MS;
  const point = [...series].reverse().find((entry) => entry.time <= cutoff);
  return point?.value ?? null;
}

function sumTeamValueAtDays(
  histories: readonly (readonly ValuePoint[])[],
  days: number,
): number | null {
  if (histories.length === 0) return null;
  let sum = 0;
  for (const series of histories) {
    const value = strictValueAtDaysAgo(series, days);
    if (value == null) return null;
    sum += value;
  }
  return sum;
}

/** Squad value today and at 1, 5, 14, and 30 calendar-day lookbacks. */
export function teamValueEvolutionSnapshot(
  histories: readonly (readonly ValuePoint[])[],
  currentTeamValue: number | null,
): TeamValueEvolutionSnapshot {
  const today = currentTeamValue;
  return {
    today,
    yesterday: sumTeamValueAtDays(histories, 1),
    fiveDaysAgo: sumTeamValueAtDays(histories, 5),
    fourteenDaysAgo: sumTeamValueAtDays(histories, 14),
    thirtyDaysAgo: sumTeamValueAtDays(histories, 30),
  };
}
