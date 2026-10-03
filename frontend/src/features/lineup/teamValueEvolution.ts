import { marketValueAtDaysAgo } from "../market/marketValueStats";
import type { ValuePoint } from "../market/model/valueSeries";

export type TeamValueEvolutionSnapshot = {
  today: number | null;
  yesterday: number | null;
  fiveDaysAgo: number | null;
  fourteenDaysAgo: number | null;
  thirtyDaysAgo: number | null;
};

function sumTeamValueAtDays(
  histories: readonly (readonly ValuePoint[])[],
  fallbacks: readonly (number | null)[],
  days: number,
): number | null {
  if (histories.length === 0) return null;
  let sum = 0;
  let contributed = false;
  for (let index = 0; index < histories.length; index += 1) {
    const series = histories[index];
    const point =
      series.length > 0
        ? marketValueAtDaysAgo(series, days)
        : (fallbacks[index] ?? null);
    if (point != null) {
      sum += point;
      contributed = true;
    }
  }
  return contributed ? sum : null;
}

/** Squad value today and at 1, 5, 14, and 30 calendar-day lookbacks. */
export function teamValueEvolutionSnapshot(
  histories: readonly (readonly ValuePoint[])[],
  fallbacks: readonly (number | null)[],
  currentTeamValue: number | null,
): TeamValueEvolutionSnapshot {
  const today =
    currentTeamValue ?? sumTeamValueAtDays(histories, fallbacks, 0);
  return {
    today,
    yesterday: sumTeamValueAtDays(histories, fallbacks, 1),
    fiveDaysAgo: sumTeamValueAtDays(histories, fallbacks, 5),
    fourteenDaysAgo: sumTeamValueAtDays(histories, fallbacks, 14),
    thirtyDaysAgo: sumTeamValueAtDays(histories, fallbacks, 30),
  };
}
