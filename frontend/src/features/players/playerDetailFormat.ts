import { formatEuro } from "../../api/format";
import { asFiniteNumber, asRecord, text } from "../../api/mappers";

const COMPACT_EURO = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

export const MISSING_STAT = "-";
export const NO_DATA_YET = "No data yet";

/** Formats wind speed from m/s to km/h for display. */
export function windKmhFromMs(speedMs: number | null | undefined): number | null {
  if (speedMs == null || !Number.isFinite(speedMs)) return null;
  return Math.round(speedMs * 3.6 * 10) / 10;
}

export function statCount(value: unknown): string {
  const record = asRecord(value);
  if (!record) return MISSING_STAT;
  const source = text(record.source);
  if (source === "unavailable") return MISSING_STAT;
  const count = asFiniteNumber(record.count);
  return count != null ? String(count) : MISSING_STAT;
}

/** Count plus fantasy points. DAZN is stored on `dazn_points`, not `count`. */
export function statDisplay(value: unknown, key?: string): string {
  const record = asRecord(value);
  if (!record) return MISSING_STAT;
  if (text(record.source) === "unavailable") return MISSING_STAT;
  if (key === "dazn_points") {
    const dazn = asFiniteNumber(record.dazn_points);
    return dazn != null ? String(dazn) : MISSING_STAT;
  }
  const count = asFiniteNumber(record.count);
  const points = asFiniteNumber(record.fantasy_points);
  if (count == null && points == null) return MISSING_STAT;
  const countText = count != null ? String(count) : MISSING_STAT;
  if (points == null) return countText;
  return `${countText} (${points} p)`;
}

/** Match date, or the matchweek when the fixtures row has no date yet. */
export function fixtureDateLabel(fixture: Record<string, unknown> | null): string {
  const raw = text(fixture?.date);
  if (raw) return raw.slice(0, 10);
  const week = asFiniteNumber(fixture?.matchweek);
  return week != null ? `J${week}` : MISSING_STAT;
}

export function scoreLabel(fixture: Record<string, unknown> | null): string | null {
  const home = asFiniteNumber(fixture?.home_score);
  const away = asFiniteNumber(fixture?.away_score);
  if (home == null || away == null) return null;
  return `${home}-${away}`;
}

/** Green at or above 5%, yellow from 0, red below. Same scale as the market value cell. */
export function marketChangeTone(percent: number | null | undefined): string {
  if (percent == null || !Number.isFinite(percent)) return "";
  if (percent >= 5) return "is-up";
  if (percent >= 0) return "is-mid";
  return "is-down";
}

export function withMarketTrend<T extends { value: number }>(
  series: readonly T[],
): (T & { trend: number })[] {
  const count = series.length;
  if (count === 0) return [];
  if (count === 1) return [{ ...series[0], trend: series[0].value }];
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  series.forEach((point, index) => {
    sumX += index;
    sumY += point.value;
    sumXY += index * point.value;
    sumXX += index * index;
  });
  const denom = count * sumXX - sumX * sumX || 1;
  const slope = (count * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / count;
  return series.map((point, index) => ({
    ...point,
    trend: Math.round(intercept + slope * index),
  }));
}

/** Short Y-axis labels for large market values (avoids duplicate full-euro ticks). */
export function formatMarketChartTick(value: number): string {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${COMPACT_EURO.format(value / 1_000_000)} M€`;
  }
  if (abs >= 10_000) {
    return `${COMPACT_EURO.format(value / 1_000)} k€`;
  }
  return formatEuro(value);
}

/** Padded [min, max] so Recharts spreads Y ticks when values are flat or tight. */
export function marketChartDomain(values: readonly number[]): [number, number] {
  const finite = values.filter((entry) => Number.isFinite(entry));
  if (finite.length === 0) return [0, 1];
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.05);
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.1;
  return [min - pad, max + pad];
}

/** X-axis label from API ISO date strings. */
export type InjuryHistoryDisplay = {
  diagnosis: string;
  period: string | null;
  duration: string | null;
};

/** Formats one injury history API row for the detail list. */
export function formatInjuryHistoryEntry(
  item: Record<string, unknown> | null,
): InjuryHistoryDisplay {
  const diagnosis = text(item?.diagnosis) ?? MISSING_STAT;
  const start = formatInjuryHistoryDate(item?.start ?? item?.startDate);
  const end = formatInjuryHistoryDate(item?.end ?? item?.endDate);
  const ongoing = item?.ongoing === true;
  const durationDays =
    asFiniteNumber(item?.duration_days) ??
    asFiniteNumber(item?.durationDays) ??
    inclusiveInjuryDays(item?.start ?? item?.startDate, item?.end ?? item?.endDate);

  let period: string | null = null;
  if (start && end) period = `${start} – ${end}`;
  else if (start) period = start;

  let duration: string | null = null;
  if (ongoing) duration = "En curso";
  else if (durationDays != null && durationDays > 0) {
    duration = durationDays === 1 ? "1 día" : `${durationDays} días`;
  }

  return { diagnosis, period, duration };
}

function inclusiveInjuryDays(startRaw: unknown, endRaw: unknown): number | null {
  const start = text(startRaw)?.slice(0, 10);
  const end = text(endRaw)?.slice(0, 10);
  if (!start || !end) return null;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}

function formatInjuryHistoryDate(raw: unknown): string | null {
  const value = text(raw);
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** External article URL from a profile news row. */
export function newsItemHref(item: Record<string, unknown> | null): string | null {
  if (!item) return null;
  for (const key of ["url", "link", "href"] as const) {
    const raw = text(item[key]);
    if (!raw) continue;
    if (raw.startsWith("//")) return `https:${raw}`;
    if (/^https?:\/\//i.test(raw)) return raw;
  }
  return null;
}

export function formatChartAxisDate(raw: string): string {
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

export function deltaRelPercent(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${value.toFixed(2)}%`;
}

export type DetailSegmentBlocks = {
  fixtures: Record<string, unknown> | null;
  market: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
};

/** Nulls segments listed in `segment_errors`; other segments stay when present. */
export function mapDetailSegmentBlocks(body: unknown): DetailSegmentBlocks {
  const detail = asRecord(body);
  const errors = new Set<string>();
  if (Array.isArray(detail?.segment_errors)) {
    for (const entry of detail.segment_errors) {
      const segment = text(asRecord(entry)?.segment);
      if (segment) errors.add(segment);
    }
  }
  const pick = (key: string): Record<string, unknown> | null => {
    if (errors.has(key)) return null;
    const value = detail?.[key];
    if (value == null) return null;
    return asRecord(value);
  };
  return {
    fixtures: pick("fixtures"),
    market: pick("market"),
    profile: pick("profile"),
  };
}
