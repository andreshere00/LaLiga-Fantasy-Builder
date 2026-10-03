import { describe, expect, it } from "vitest";

import { userBidsByMarketId } from "./listing";
import { patchMarketSnapshotBid } from "./marketSnapshotPatch";

describe("userBidsByMarketId", () => {
  it("userBidsByMarketId_maps_entries_by_market_listing_id", () => {
    const map = userBidsByMarketId({
      marketPlayers: [],
      userBids: [
        { marketId: "mk-9", id: "bid-9", money: 500_000 },
        { marketPlayerId: "mk-2", bid: { id: "bid-2", money: 120_000 } },
      ],
    });
    expect(map.get("mk-9")).toEqual({ id: "bid-9", money: 500_000 });
    expect(map.get("mk-2")).toEqual({ id: "bid-2", money: 120_000 });
  });
});

describe("patchMarketSnapshotBid", () => {
  it("patchMarketSnapshotBid_sets_listing_bid_and_userBids", () => {
    const snapshot = {
      marketPlayers: [{ id: "mk-1", playerMaster: { id: "p1" } }],
      userBids: [],
    };
    const next = patchMarketSnapshotBid(snapshot, "mk-1", {
      id: "bid-1",
      money: 750_000,
    }) as {
      marketPlayers: { id: string; bid?: { id: string; money: number } }[];
      userBids: unknown[];
    };
    expect(next.marketPlayers[0]?.bid).toEqual({
      id: "bid-1",
      money: 750_000,
      status: "pending",
    });
    expect(next.userBids).toHaveLength(1);
  });

  it("patchMarketSnapshotBid_clears_bid_on_cancel", () => {
    const snapshot = {
      marketPlayers: [{ id: "mk-1", bid: { id: "bid-1", money: 1 } }],
      userBids: [{ marketId: "mk-1", id: "bid-1", money: 1 }],
    };
    const next = patchMarketSnapshotBid(snapshot, "mk-1", null) as {
      marketPlayers: { bid?: unknown }[];
      userBids: unknown[];
    };
    expect(next.marketPlayers[0]?.bid).toBeUndefined();
    expect(next.userBids).toHaveLength(0);
  });

  it("patchMarketSnapshotBid_clears_nested_userBids_by_bid_id", () => {
    const snapshot = {
      market: {
        marketPlayers: [{ id: "mk-1", bid: { id: "bid-real", money: 2 } }],
        userBids: [{ id: "bid-envelope", marketPlayerId: "mk-1", bid: { id: "bid-real", money: 2 } }],
      },
    };
    const next = patchMarketSnapshotBid(snapshot, "mk-1", null, {
      removedBidId: "bid-real",
    }) as { market: { marketPlayers: { bid?: unknown }[]; userBids: unknown[] } };
    expect(next.market.marketPlayers[0]?.bid).toBeUndefined();
    expect(next.market.userBids).toHaveLength(0);
  });
});
