import { t, locale } from ".";
/** Read locale at use time, including formatters declared at module scope. */
export function numberFormatter(options?: Intl.NumberFormatOptions) {
  return { format: (value: number) => new Intl.NumberFormat(locale(), options).format(value) };
}
export function dateFormatter(options?: Intl.DateTimeFormatOptions) {
  return { format: (value: Date | number) => new Intl.DateTimeFormat(locale(), options).format(value) };
}
/** Fixed precision display; numeric calculations keep their original values. */
export function decimal(value: number, digits: number): string {
  return numberFormatter({ minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(value);
}

/** Format whole duration units without translating machine-readable countdown strings. */
export function durationLabel(totalMinutes: number, omitZero = false): string {
  const minutes = Math.max(0, totalMinutes);
  const parts = [Math.floor(minutes / 1440), Math.floor(minutes % 1440 / 60), minutes % 60];
  const labels = [
    (n: number) => n === 1 ? t("{{0}} day", { 0: n }) : t("{{0}} days", { 0: n }),
    (n: number) => n === 1 ? t("{{0}} hour", { 0: n }) : t("{{0}} hours", { 0: n }),
    (n: number) => n === 1 ? t("{{0}} minute", { 0: n }) : t("{{0}} minutes", { 0: n }),
  ];
  return parts.flatMap((n, i) => omitZero && n === 0 ? [] : [labels[i](n)]).join(" ") || t("0 minutes");
}
