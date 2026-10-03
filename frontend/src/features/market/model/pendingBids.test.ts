import { describe, expect, it } from "vitest";

import { applyPendingBids, type PendingBid } from "./pendingBids";

// ---- Mocks, fixtures & helpers ---- #

const NOW = 1_000;

function pending(entry: Partial<PendingBid>): Map<string, PendingBid> {
  return new Map([
    ["mk-1", { myBid: null, removedBidId: null, until: NOW + 10_000, ...entry }],
  ]);
}

function bidOf(snapshot: unknown): unknown {
  return (snapshot as { marketPlayers: { bid?: unknown }[] }).marketPlayers[0]?.bid;
}

// ---- Happy path ---- #

describe("applyPendingBids", () => {
  it("applyPendingBids_stale_snapshot_keeps_cancelled_state", () => {
    const stale = { marketPlayers: [{ id: "mk-1", bid: { id: "b1", money: 5 } }], userBids: [] };
    const result = applyPendingBids(stale, pending({ removedBidId: "b1" }), NOW);
    expect(bidOf(result.snapshot)).toBeUndefined();
    expect(result.remaining.size).toBe(1);
  });

  it("applyPendingBids_stale_snapshot_keeps_created_bid", () => {
    const stale = { marketPlayers: [{ id: "mk-1" }], userBids: [] };
    const result = applyPendingBids(
      stale,
      pending({ myBid: { id: "local-mk-1", money: 9 } }),
      NOW,
    );
    expect(bidOf(result.snapshot)).toMatchObject({ money: 9 });
  });

  it("applyPendingBids_confirmed_by_server_drops_entry", () => {
    const fresh = { marketPlayers: [{ id: "mk-1" }], userBids: [] };
    const result = applyPendingBids(fresh, pending({ removedBidId: "b1" }), NOW);
    expect(result.remaining.size).toBe(0);
  });

  // ---- Edge cases ---- #

  it("applyPendingBids_expired_entry_is_ignored", () => {
    const stale = { marketPlayers: [{ id: "mk-1", bid: { id: "b1", money: 5 } }], userBids: [] };
    const result = applyPendingBids(stale, pending({ until: NOW - 1 }), NOW);
    expect(bidOf(result.snapshot)).toEqual({ id: "b1", money: 5 });
    expect(result.remaining.size).toBe(0);
  });
});
