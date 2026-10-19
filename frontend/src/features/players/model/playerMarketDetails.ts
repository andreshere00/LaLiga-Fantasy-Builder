import type { ReleaseClauseData } from "../../market/model/protection";
import type { MarketRow } from "../../market/model/row";
import type { PlayerRow } from "./playerRow";

/** Avoid joining a listing from a previous owner or squad entry onto the catalog. */
export function matchingPlayerListing(row: PlayerRow, listing: MarketRow | null): MarketRow | null {
  if (!listing) return null;
  const owner = row.ownership;
  if (owner) {
    return listing.sellerTeamId === owner.teamId && owner.playerTeamId != null
      && listing.playerTeamId === owner.playerTeamId ? listing : null;
  }
  if (row.ownedBy === "Free Agent" && listing.sellerKind !== "laliga") return null;
  return listing;
}

/** Known roster fields win; only a matching listing can fill missing metadata. */
export function playerClauseDetails(row: PlayerRow, listing: MarketRow | null): ReleaseClauseData {
  const owner = row.ownership;
  const matching = matchingPlayerListing(row, listing);
  if (owner) {
    return {
      buyoutClause: owner.buyoutClause ?? matching?.buyoutClause ?? null,
      isShielded: owner.isShielded ?? (matching?.isShielded === true ? true : null),
      clauseUnlockAt: owner.clauseUnlockAt ?? matching?.clauseUnlockAt ?? null,
      sellerKind: matching?.sellerKind ?? "opponent",
    };
  }
  if (matching) return matching;
  return {
    buyoutClause: null,
    isShielded: null,
    clauseUnlockAt: null,
    sellerKind: row.ownedBy === "Free Agent" ? "laliga" : "opponent",
  };
}
