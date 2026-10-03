import { asFiniteNumber, asRecord } from "../../../api/mappers";

export type ValuePoint = { time: number; value: number };

const VARIATION_DAYS = 5;
const DAY_MS = 86_400_000;

/** Parses ``GET /players/{id}/market-value`` into an ascending value series. */
export function valueSeries(history: unknown): ValuePoint[] {
  if (!Array.isArray(history)) return [];
  const points: ValuePoint[] = [];
  for (const entry of history) {
    const row = asRecord(entry);
    const value = asFiniteNumber(row?.marketValue);
    const time = typeof row?.date === "string" ? Date.parse(row.date) : Number.NaN;
    if (value != null && Number.isFinite(time)) points.push({ time, value });
  }
  return points.sort((left, right) => left.time - right.time);
}

/** Difference between the latest value and the value five days earlier. */
export function valueVariation(series: readonly ValuePoint[]): number | null {
  if (series.length < 2) return null;
  const latest = series[series.length - 1];
  const cutoff = latest.time - VARIATION_DAYS * DAY_MS;
  const reference = [...series].reverse().find((point) => point.time <= cutoff) ?? series[0];
  return latest.value - reference.value;
}

/** Relative change over five days, as a percentage of the reference value. */
export function valueVariationPercent(series: readonly ValuePoint[]): number | null {
  const delta = valueVariation(series);
  if (delta == null || series.length < 2) return null;
  const latest = series[series.length - 1];
  const reference = latest.value - delta;
  if (reference === 0) return null;
  return (delta / reference) * 100;
}

/** Whole milliseconds left until expiry, or null when the date is unknown. */
export function remainingMs(expiresAt: number | null, now: number): number | null {
  return expiresAt == null ? null : Math.max(0, expiresAt - now);
}

/** Human label such as ``2d 3h``, ``5h 10m`` or ``Expired``. */
export function remainingLabel(expiresAt: number | null, now: number): string {
  const left = remainingMs(expiresAt, now);
  if (left == null) return "—";
  if (left === 0) return "Expired";
  const minutes = Math.floor(left / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
