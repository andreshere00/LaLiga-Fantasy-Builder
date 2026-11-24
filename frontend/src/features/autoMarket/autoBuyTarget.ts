import type { MarketRow } from "../market/model/row";
import type { AutoRuleTarget } from "./autoRule";

/** A market row to bid on; a rival's squad entry also lets the release clause be paid. */
export function autoBuyTarget(row: MarketRow): AutoRuleTarget {
  return {
    side: "buy", playerId: row.playerId!, playerTeamId: row.playerTeamId, name: row.name,
    marketValue: row.marketValue, listed: row.marketId !== "",
    clause: row.sellerKind === "opponent" && row.playerTeamId
      ? { amount: row.buyoutClause, unlockAt: row.clauseUnlockAt } : null,
  };
}
