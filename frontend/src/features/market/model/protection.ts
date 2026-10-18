import type { MarketRow } from "./row";

/** A paid shield or a known future clause lock proves protection. */
export function protectionDescription(row: MarketRow, now: number): string | null {
  if (row.isShielded) return "Release clause protected";
  if (row.clauseUnlockAt != null && row.clauseUnlockAt > now) {
    return `Release clause locked until ${new Date(row.clauseUnlockAt).toLocaleString()}`;
  }
  return null;
}
