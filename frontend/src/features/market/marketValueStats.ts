import { formatEuro, formatPercent } from "../../api/format";
import type { ValuePoint } from "./model/valueSeries";
import { DAY_MS } from "./model/valueSeries";

export type MarketValueSnapshot = {
  last: number | null;
  best: number | null;
  lowest: number | null;
  fiveDaysAgo: number | null;
  fourteenDaysAgo: number | null;
};

/** Value at or before ``days`` calendar days before the latest sample. */
export function marketValueAtDaysAgo(
  series: readonly ValuePoint[],
  days: number,
): number | null {
  if (series.length === 0) return null;
  const latest = series[series.length - 1];
  const cutoff = latest.time - days * DAY_MS;
  const point = [...series].reverse().find((entry) => entry.time <= cutoff) ?? series[0];
  return point.value;
}

/** Last, extrema, and lagged values from a player market-value series. */
export function marketValueSnapshot(
  series: readonly ValuePoint[],
  catalogValue: number | null = null,
): MarketValueSnapshot {
  if (series.length === 0) {
    return {
      last: catalogValue,
      best: null,
      lowest: null,
      fiveDaysAgo: null,
      fourteenDaysAgo: null,
    };
  }
  let best = series[0].value;
  let lowest = series[0].value;
  for (const point of series) {
    if (point.value > best) best = point.value;
    if (point.value < lowest) lowest = point.value;
  }
  const last = series[series.length - 1].value;
  return {
    last,
    best,
    lowest,
    fiveDaysAgo: marketValueAtDaysAgo(series, 5),
    fourteenDaysAgo: marketValueAtDaysAgo(series, 14),
  };
}

export function formatMarketValueStat(value: number | null): string {
  return value == null ? "—" : formatEuro(value);
}

/** Percentage change of ``current`` relative to ``reference``, or null when undefined. */
export function relativeChangePercent(
  current: number | null,
  reference: number | null,
): number | null {
  if (current == null || reference == null || reference === 0) return null;
  return ((current - reference) / reference) * 100;
}

/** Formatted value with its relative change vs the current value, e.g. ``1.2 M € (-20%)``. */
export function formatMarketValueWithChange(
  reference: number | null,
  current: number | null,
): string {
  const percent = formatPercent(relativeChangePercent(current, reference));
  const value = formatMarketValueStat(reference);
  return percent ? `${value} (${percent})` : value;
}
