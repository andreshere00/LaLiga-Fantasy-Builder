// ---- Mocks, fixtures & helpers ---- //
import { describe, expect, it } from "vitest";
import type { MarketRow } from "../market/model/row";
import { autoBuyTarget } from "./autoBuyTarget";

const row: MarketRow = {
  id: "m", marketId: "m1", playerId: "8", playerTeamId: null, name: "Gavi", positionId: 1,
  photoUrl: null, teamBadgeUrl: null, teamName: null, points: null, form: null, formRecent: [],
  formRecentWeeks: [], averagePoints: null, marketValue: 90_000_000, variation: null, variationPercent: null,
  availability: "available", expiresAt: null, seller: "LaLiga", sellerTeamId: null, sellerKind: "laliga",
  buyoutClause: null, clauseUnlockAt: null, isShielded: false, myBid: null, directOffer: false, valueHistory: [],
};

// ---- Happy path ---- //
describe("autoBuyTarget", () => {
  it("autoBuyTarget_official_listing_can_only_be_bid_on", () => {
    expect(autoBuyTarget(row)).toEqual({
      side: "buy", playerId: "8", playerTeamId: null, name: "Gavi", marketValue: 90_000_000, listed: true, clause: null,
    });
  });
  it("autoBuyTarget_rival_listing_also_offers_the_release_clause_with_its_unlock", () => {
    const target = autoBuyTarget({
      ...row, sellerKind: "opponent", playerTeamId: "s8", buyoutClause: 92_000_000, clauseUnlockAt: 5,
    });
    expect(target).toMatchObject({ playerTeamId: "s8", listed: true, clause: { amount: 92_000_000, unlockAt: 5 } });
  });
  // ---- Edge cases ---- //
  it("autoBuyTarget_row_without_a_listing_is_clause_only", () => {
    const target = autoBuyTarget({ ...row, marketId: "", sellerKind: "opponent", playerTeamId: "s8" });
    expect(target.listed).toBe(false);
    expect(target.clause).not.toBeNull();
  });
  it("autoBuyTarget_rival_row_without_a_squad_entry_cannot_pay_a_clause", () => {
    expect(autoBuyTarget({ ...row, sellerKind: "opponent" }).clause).toBeNull();
  });
});
