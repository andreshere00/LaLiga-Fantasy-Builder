import { formatIntegerAmount } from "../../api/format";

export const MARKET_VALUE_FILTER_MIN = 1_000;
export const MARKET_VALUE_FILTER_MAX = 1_000_000;
export const MARKET_VALUE_FILTER_STEP = 1_000;

export const STAT_FILTER_STEP = 1;

const MARKET_VALUE_MAX_DIGITS = 7;

/** Keeps only ASCII digits, capped for market-value filter typing. */
export function digitsOnlyMarketValueInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, MARKET_VALUE_MAX_DIGITS);
}

/** Formats market-value filter text for display (es-ES grouping, no decimals). */
export function formatMarketValueFilterInput(raw: string): string {
  const digits = digitsOnlyMarketValueInput(raw);
  if (digits === "") return "";
  return formatIntegerAmount(Number(digits));
}

/**
 * Parses a market-value bound for filtering; empty input clears, out-of-range values clamp.
 */
export function parseMarketValueFilterBound(raw: string): number | null {
  const digits = digitsOnlyMarketValueInput(raw);
  if (digits === "") return null;
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  return Math.min(MARKET_VALUE_FILTER_MAX, Math.max(MARKET_VALUE_FILTER_MIN, value));
}

/** Steps a market-value filter bound by whole thousands within the euro range. */
export function stepMarketValueFilterBound(
  current: number | null,
  deltaSteps: number,
): number | null {
  if (deltaSteps === 0) return current;
  if (current == null) {
    return deltaSteps > 0 ? MARKET_VALUE_FILTER_MIN : null;
  }
  const next = current + deltaSteps * MARKET_VALUE_FILTER_STEP;
  return Math.min(MARKET_VALUE_FILTER_MAX, Math.max(MARKET_VALUE_FILTER_MIN, next));
}

const POINTS_FORM_MAX_DIGITS = 4;

/** Non-negative whole numbers for points and form filters. */
export function digitsOnlyStatInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, POINTS_FORM_MAX_DIGITS);
}

export function formatStatFilterInput(raw: string): string {
  const digits = digitsOnlyStatInput(raw);
  if (digits === "") return "";
  return formatIntegerAmount(Number(digits));
}

export function parseStatFilterBound(raw: string): number | null {
  const digits = digitsOnlyStatInput(raw);
  if (digits === "") return null;
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  return value;
}

/** Steps a points or form filter bound by whole units (minimum zero). */
export function stepStatFilterBound(current: number | null, deltaSteps: number): number | null {
  if (deltaSteps === 0) return current;
  if (current == null) {
    return deltaSteps > 0 ? 0 : null;
  }
  const next = current + deltaSteps * STAT_FILTER_STEP;
  return Math.max(0, next);
}
