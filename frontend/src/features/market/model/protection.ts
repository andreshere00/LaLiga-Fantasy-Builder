import type { SellerKind } from "./row";

export type ClauseProtection = {
  isShielded: boolean | null;
  clauseUnlockAt: number | null;
};

export type ReleaseClauseData = ClauseProtection & {
  buyoutClause: number | null;
  sellerKind: SellerKind;
};

/** A paid shield or a known future clause lock proves protection. */
export function protectionDescription(row: ClauseProtection, now: number): string | null {
  if (row.isShielded === true) return "Release clause protected";
  if (row.clauseUnlockAt != null && row.clauseUnlockAt > now) {
    return `Release clause locked until ${new Date(row.clauseUnlockAt).toLocaleString()}`;
  }
  return null;
}
