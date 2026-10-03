import { useSyncExternalStore } from "react";

import { asRecord, idText, asFiniteNumber } from "../../../api/mappers";
import { marketItems, userBidsByMarketId, type UserBidRef } from "./listing";
import { patchMarketSnapshotBid } from "./marketSnapshotPatch";

export const PENDING_BID_TTL_MS = 20_000;
const LOCAL_BID_PREFIX = "local-";

/** Synthetic bid id used until the server reports the real one. */
export const localBidId = (marketId: string): string => `${LOCAL_BID_PREFIX}${marketId}`;

/** True for synthetic ids that the upstream does not know yet. */
export const isLocalBidId = (bidId: string | null | undefined): boolean =>
  bidId?.startsWith(LOCAL_BID_PREFIX) ?? false;

export type PendingBid = {
  myBid: UserBidRef | null;
  removedBidId: string | null;
  until: number;
};

export type PendingBids = ReadonlyMap<string, PendingBid>;

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

const EMPTY_PENDING: PendingBids = new Map();
const pendingByLeague = new Map<string, PendingBids>();
const listeners = new Set<() => void>();

function setPending(leagueId: string, next: PendingBids): void {
  pendingByLeague.set(leagueId, next);
  listeners.forEach((listener) => listener());
}

function subscribePending(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribes to the unconfirmed local bid changes of one league. */
export function usePendingBids(leagueId: string): PendingBids {
  return useSyncExternalStore(
    subscribePending,
    () => pendingByLeague.get(leagueId) ?? EMPTY_PENDING,
  );
}

/** Drops expired or server-confirmed entries once a fresh snapshot is available. */
export function prunePendingBids(leagueId: string, snapshot: unknown): void {
  const current = pendingByLeague.get(leagueId);
  if (!current || current.size === 0 || snapshot == null) return;
  const { remaining } = applyPendingBids(snapshot, current, Date.now());
  if (remaining.size !== current.size) setPending(leagueId, remaining);
}

/** Drops a pending bid change (e.g. when the mutation failed). */
export function clearPendingBid(leagueId: string, marketId: string): void {
  const current = pendingByLeague.get(leagueId);
  if (!current?.has(marketId)) return;
  const next = new Map(current);
  next.delete(marketId);
  setPending(leagueId, next);
}

/** Records a local bid change that must survive stale refetches until confirmed. */
export function recordPendingBid(
  leagueId: string,
  marketId: string,
  myBid: UserBidRef | null,
  removedBidId: string | null,
): void {
  const next = new Map(pendingByLeague.get(leagueId) ?? EMPTY_PENDING);
  next.set(marketId, { myBid, removedBidId, until: Date.now() + PENDING_BID_TTL_MS });
  setPending(leagueId, next);
  window.setTimeout(() => expirePendingBids(leagueId), PENDING_BID_TTL_MS + 1);
}

function expirePendingBids(leagueId: string): void {
  const current = pendingByLeague.get(leagueId);
  if (!current) return;
  const now = Date.now();
  const live = new Map([...current].filter(([, entry]) => entry.until > now));
  if (live.size !== current.size) setPending(leagueId, live);
}
