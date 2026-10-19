import { describe, expect, it } from "vitest";
import { normalizeActiveBids, projectBids } from "./activeBids";
import { applyPendingBids, type PendingBid } from "./pendingBids";
import { patchMarketSnapshotBid } from "./marketSnapshotPatch";
import { marketItems } from "./listing";

// ---- Mocks, fixtures & helpers ---- #
const now = Date.parse("2026-10-12T12:00:00Z");
const player = { id: "p1", nickname: "Test Player", marketValue: 50 };
const bid = { id: "b1", money: 100, status: "pending" };
const listing = { id: "m1", playerMaster: player, numberOfBids: 2, bid,
  expirationDate: "2026-10-13T12:00:00Z" };
const normalize = (snapshot: unknown) => normalizeActiveBids(snapshot, [], now);

// ---- Happy path ---- #
describe("active bids", () => {
  it("should deduplicate listing and envelope copies and preserve separate identities", () => {
    const active = normalize({ marketPlayers: [{ ...listing,
      playerTeam: { playerTeamId: "s1", teamId: "t2" } }],
    userBids: [{ ...bid, marketId: "m1" }] });
    expect(active.bids).toHaveLength(1);
    expect(active.spending).toBe(100);
    expect(active.bids[0]).toMatchObject({ id: "b1", marketId: "m1", playerId: "p1",
      playerTeamId: "s1", name: "Test Player", confirmed: true });
    expect(active.bids[0].actionRow?.myBid).toEqual({ id: "b1", money: 100 });
  });

  it("should support a listing-only snapshot and bids outside visible listings", () => {
    expect(normalize([listing]).spending).toBe(100);
    const active = normalize({ marketPlayers: [], userBids: [bid] });
    expect(active.spending).toBe(100);
    expect(active.bids[0].name).toContain("Player unavailable");
    expect(active.bids[0].actionRow).toBeNull();
  });

  it("should join embedded player metadata and catalog data without visible listings", () => {
    const active = normalizeActiveBids({ userBids: [{ ...bid, marketPlayer: {
      id: "m1", playerMasterId: "p1", playerTeamId: "s1" },
    }] }, [player], now);
    expect(active.bids[0]).toMatchObject({ name: "Test Player", playerId: "p1",
      playerTeamId: "s1", marketId: "m1" });
  });

  it("should reconcile synthetic ids by listing identity without double counting", () => {
    const active = normalize({ marketPlayers: [{ ...listing, bid: { ...bid, id: "local-m1" } }],
      userBids: [{ ...bid, marketId: "m1" }] });
    expect(active.bids).toHaveLength(1);
    expect(active.bids[0].id).toBe("b1");
    expect(active.spending).toBe(100);
  });

  it("should prefer the authoritative bid id over an envelope id and retain partial bid metadata", () => {
    const active = normalize({ marketPlayers: [listing], userBids: [
      { id: "envelope", bidId: "b1", marketId: "m1", money: 100, status: "pending", bid: {} },
    ] });
    expect(active.bids).toHaveLength(1);
    expect(active.spending).toBe(100);
    expect(active.bids[0].id).toBe("b1");
  });

  it("should update spending and count once through create, stale refetch, modify and cancel", () => {
    const initial = { marketPlayers: [{ ...listing, bid: null, numberOfBids: 0 }] };
    const pending = new Map<string, PendingBid>([["m1", { myBid: { id: "local-m1", money: 100 },
      removedBidId: null, until: now + 20_000 }]]);
    const created = applyPendingBids(initial, pending, now).snapshot;
    expect(normalize(created).spending).toBe(100);
    expect(marketItems(created)[0].numberOfBids).toBe(1);
    const reapplied = applyPendingBids(created, pending, now).snapshot;
    expect(marketItems(reapplied)[0].numberOfBids).toBe(1);
    const confirmed = applyPendingBids({ marketPlayers: [listing] }, pending, now);
    expect(confirmed.remaining.size).toBe(0);
    expect(normalize(confirmed.snapshot).spending).toBe(100);
    const modified = patchMarketSnapshotBid(confirmed.snapshot, "m1", { id: "b1", money: 200 });
    expect(normalize(modified).spending).toBe(200);
    expect(marketItems(modified)[0].numberOfBids).toBe(2);
    const cancelled = patchMarketSnapshotBid(modified, "m1", null, { removedBidId: "b1" });
    expect(normalize(cancelled).spending).toBe(0);
    expect(marketItems(cancelled)[0].numberOfBids).toBe(1);
    expect(marketItems(patchMarketSnapshotBid(cancelled, "m1", null))[0].numberOfBids).toBe(1);
  });

  it("should adjust counts for supplemental-only bids and retain unknown counts", () => {
    const snapshot = { marketPlayers: [{ id: "m1", numberOfBids: 3 }, { id: "m2" }],
      userBids: [{ ...bid, marketId: "m1" }] };
    const modified = patchMarketSnapshotBid(snapshot, "m1", { id: "b1", money: 200 });
    expect(marketItems(modified)[0].numberOfBids).toBe(3);
    expect(marketItems(patchMarketSnapshotBid(snapshot, "m1", null))[0].numberOfBids).toBe(2);
    expect(marketItems(patchMarketSnapshotBid(snapshot, "m2", { id: "b2", money: 1 }))[1].numberOfBids).toBeUndefined();
  });

  // ---- Error paths ---- #
  it("should never substitute a listing id for a missing bid id", () => {
    const active = normalize({ marketPlayers: [{ ...listing, bid: { money: 100, status: "pending" } }] });
    expect(active.bids).toHaveLength(1);
    expect(active.bids[0]).toMatchObject({ id: null, marketId: "m1", actionRow: null });
    expect(active.spending).toBeNull();
  });

  it("should retain unknown records and mark missing or conflicting amounts incomplete", () => {
    for (const money of [undefined, -1, 1.5, 0]) {
      const active = normalize({ userBids: [{ id: "b1", money, status: "pending" }] });
      expect(active.bids).toHaveLength(1);
      expect(active.spending).toBeNull();
    }
    expect(normalize({ marketPlayers: [listing], userBids: [{ ...bid, money: 101 }] }).complete).toBe(false);
    expect(normalize({ userBids: [bid, { ...bid, money: 101 }] }).spending).toBeNull();
    expect(normalize({ userBids: [{ ...bid, status: "surprise" }] }).spending).toBeNull();
    expect(normalize({ userBids: [{ money: 100, status: "pending" }] }).spending).toBeNull();
  });

  // ---- Edge cases ---- #
  it("should exclude terminal and expired bids but keep unknown expiries last", () => {
    const active = normalize({ userBids: [
      ...["accepted", "rejected", "cancelled", "canceled", "expired"].map((status) => ({ ...bid, id: status, status })),
      { ...bid, id: "old", expirationDate: "2026-10-11T12:00:00Z" },
      { ...bid, id: "unknown" },
      { ...bid, id: "later", expirationDate: "2026-10-14T12:00:00Z" },
      { ...bid, id: "soon", expirationDate: "2026-10-13T12:00:00Z" },
    ] });
    expect(active.bids.map((entry) => entry.id)).toEqual(["soon", "later", "unknown"]);
    expect(active.spending).toBe(300);
  });

  it("should never authorize synthetic, unknown-status or invalid-expiration bids", () => {
    for (const change of [{ id: "local-m1" }, { status: "unverified" },
      { expirationDate: "bad" }, { status: undefined }]) {
      const active = normalize({ marketPlayers: [{ ...listing, bid: { ...bid, ...change } }] });
      expect(active.bids[0].actionRow).toBeNull();
    }
  });
});

describe("bid projections", () => {
  const active = normalize({ marketPlayers: [listing] });
  it.each(["gross", "net", "unknown"] as const)("should respect %s reservation accounting", (semantics) => {
    expect(projectBids(80, active, semantics)).toEqual({ spending: 100,
      available: semantics === "net" ? 80 : -20, estimated: semantics === "unknown", complete: true });
  });
  it("should handle zero bids, unknown balance and incomplete commitments", () => {
    expect(projectBids(-50, normalize({ marketPlayers: [] })).available).toBe(-50);
    expect(projectBids(null, active)).toMatchObject({ spending: 100, available: null, complete: false });
    expect(projectBids(100, normalize(undefined)).available).toBeNull();
    expect(projectBids(100, normalize({})).available).toBeNull();
    expect(projectBids(100, normalize({ userBids: [{}] })).available).toBeNull();
  });
});
