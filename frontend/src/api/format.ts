import { locale } from "../i18n";

export function formatEuro(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat(locale()).format(value)} €`;
}

/** Whole-euro amount with current locale grouping (e.g. ``739.427``), without the currency suffix. */
export function formatIntegerAmount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  return new Intl.NumberFormat(locale()).format(Math.trunc(value));
}

/** Parses either grouping convention without reinterpreting an edited draft. */
export function parseIntegerAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed) && !/^\d{1,3}([.,])\d{3}(?:\1\d{3})*$/.test(trimmed)) return null;
  const value = Number(trimmed.replace(/[.,]/g, ""));
  return Number.isSafeInteger(value) ? value : null;
}

/** @deprecated Use formatEuro; kept for lineup "team value" wording. */
export function formatTeamValue(value: number | null | undefined): string {
  return formatEuro(value);
}

export function formatSignedEuro(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat(locale()).format(value)} €`;
}

export function formatPercent(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(rounded)}%`;
}

export function pointsLabel(points: number | null | undefined): string {
  if (points == null || Number.isNaN(points)) return "—";
  return `${new Intl.NumberFormat(locale()).format(points)} p`;
}
