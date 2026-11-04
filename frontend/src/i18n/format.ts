import { locale } from ".";
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
