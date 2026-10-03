const EURO = new Intl.NumberFormat("es-ES");
const POINTS = new Intl.NumberFormat("es-ES");

export function formatEuro(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${EURO.format(value)} €`;
}

/** Whole-euro amount with es-ES grouping (e.g. ``739.427``), without the currency suffix. */
export function formatIntegerAmount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  return EURO.format(Math.trunc(value));
}

/** Parses grouped euro input (dots as thousands) into a whole number. */
export function parseIntegerAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (trimmed === "") return null;
  const withoutThousands = trimmed.replace(/\./g, "");
  const whole = withoutThousands.split(",")[0] ?? "";
  if (whole === "" || !/^\d+$/.test(whole)) return null;
  const value = Number(whole);
  if (!Number.isFinite(value)) return null;
  return value;
}

/** @deprecated Use formatEuro; kept for lineup "team value" wording. */
export function formatTeamValue(value: number | null | undefined): string {
  return formatEuro(value);
}

export function formatSignedEuro(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${EURO.format(value)} €`;
}

export function formatPercent(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

export function pointsLabel(points: number | null | undefined): string {
  if (points == null || Number.isNaN(points)) return "—";
  return `${POINTS.format(points)} p`;
}
