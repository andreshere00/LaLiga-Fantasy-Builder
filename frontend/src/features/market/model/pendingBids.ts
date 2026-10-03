import type { QueryClient } from "@tanstack/react-query";

import { asRecord, idText, asFiniteNumber } from "../../../api/mappers";
import { marketItems, userBidsByMarketId, type UserBidRef } from "./listing";
import { patchMarketSnapshotBid } from "./marketSnapshotPatch";

export const PENDING_BID_TTL_MS = 20_000;

export type PendingBid = {
  myBid: UserBidRef | null;
  removedBidId: string | null;
  until: number;
};

export type PendingBids = ReadonlyMap<string, PendingBid>;

export const pendingBidsKey = (leagueId: string) => ["market-pending-bids", leagueId] as const;

function serverBidFor(snapshot: unknown, marketId: string): UserBidRef | null {
  const item = marketItems(snapshot).find((entry) => idText(entry.id) === marketId);
  const bid = asRecord(item?.bid);
  const id = idText(bid?.id);
  const money = asFiniteNumber(bid?.money);
  if (id && money != null) return { id, money };
  return userBidsByMarketId(snapshot).get(marketId) ?? null;
}

function confirmed(pending: PendingBid, server: UserBidRef | null): boolean {
  if (pending.myBid == null) return server == null;
  return server != null && server.money === pending.myBid.money;
}

/** Re-applies unconfirmed local bid changes onto a freshly fetched snapshot. */
export function applyPendingBids(
  snapshot: unknown,
  pending: PendingBids,
  now: number,
): { snapshot: unknown; remaining: Map<string, PendingBid> } {
  const remaining = new Map<string, PendingBid>();
  let next = snapshot;
  for (const [marketId, entry] of pending) {
    if (entry.until <= now || confirmed(entry, serverBidFor(snapshot, marketId))) continue;
    remaining.set(marketId, entry);
    next = patchMarketSnapshotBid(next, marketId, entry.myBid, {
      removedBidId: entry.removedBidId,
    });
  }
  return { snapshot: next, remaining };
}

/** Reconciles a fetched market snapshot with the pending overlay stored in the query cache. */
export function reconcileMarketSnapshot(
  queryClient: QueryClient,
  leagueId: string,
  snapshot: unknown,
): unknown {
  const pending = queryClient.getQueryData<PendingBids>(pendingBidsKey(leagueId));
  if (!pending || pending.size === 0) return snapshot;
  const { snapshot: next, remaining } = applyPendingBids(snapshot, pending, Date.now());
  queryClient.setQueryData(pendingBidsKey(leagueId), remaining);
  return next;
}

/** Drops a pending bid change (e.g. when the mutation failed). */
export function clearPendingBid(
  queryClient: QueryClient,
  leagueId: string,
  marketId: string,
): void {
  const current = queryClient.getQueryData<PendingBids>(pendingBidsKey(leagueId));
  if (!current?.has(marketId)) return;
  const next = new Map(current);
  next.delete(marketId);
  queryClient.setQueryData(pendingBidsKey(leagueId), next);
}

/** Records a local bid change that must survive stale refetches until confirmed. */
export function recordPendingBid(
  queryClient: QueryClient,
  leagueId: string,
  marketId: string,
  myBid: UserBidRef | null,
  removedBidId: string | null,
): void {
  const current = queryClient.getQueryData<PendingBids>(pendingBidsKey(leagueId)) ?? new Map();
  const next = new Map(current);
  next.set(marketId, { myBid, removedBidId, until: Date.now() + PENDING_BID_TTL_MS });
  queryClient.setQueryData(pendingBidsKey(leagueId), next);
}
