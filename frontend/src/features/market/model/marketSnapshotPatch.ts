import { asRecord, idText } from "../../../api/mappers";
import type { UserBidRef } from "./listing";
import { marketItems, userBidRecords, userBidsByMarketId } from "./listing";

export type PatchMarketBidOptions = {
  /** Bid id removed on cancel (drops orphan ``userBids`` rows). */
  removedBidId?: string | null;
};

function patchListingBid(
  item: Record<string, unknown>,
  marketId: string,
  myBid: UserBidRef | null,
  delta: number,
): Record<string, unknown> {
  if (idText(item.id) !== marketId) return item;
  const count = item.numberOfBids;
  const numberOfBids = typeof count === "number" && Number.isSafeInteger(count) && count >= 0
    ? Math.max(0, count + delta) : count;
  if (myBid == null) {
    const { bid: _removed, ...rest } = item;
    return { ...rest, numberOfBids };
  }
  return {
    ...item,
    numberOfBids,
    bid: {
      ...(asRecord(item.bid) ?? {}),
      id: myBid.id,
      money: myBid.money,
      status: "pending",
    },
  };
}

function marketIdFromUserBidRecord(record: Record<string, unknown>): string | null {
  const marketPlayer = asRecord(record.marketPlayer);
  return (
    idText(record.marketId) ??
    idText(record.marketPlayerId) ??
    idText(marketPlayer?.id) ??
    idText(asRecord(record.playerMarket)?.id)
  );
}

function bidIdFromUserBidRecord(record: Record<string, unknown>): string | null {
  const bid = asRecord(record.bid);
  return idText(bid?.id) ?? idText(record.bidId) ?? idText(record.id);
}

function shouldDropUserBidEntry(
  record: Record<string, unknown>,
  marketId: string,
  removedBidId: string | null,
): boolean {
  if (marketIdFromUserBidRecord(record) === marketId) return true;
  if (removedBidId && bidIdFromUserBidRecord(record) === removedBidId) return true;
  return false;
}

function patchUserBidsList(
  bids: unknown[],
  marketId: string,
  myBid: UserBidRef | null,
  removedBidId: string | null,
): unknown[] {
  const existing = bids.map(asRecord).find((record) => record &&
    marketIdFromUserBidRecord(record) === marketId);
  const filtered = bids.filter((entry) => {
    const record = asRecord(entry);
    if (!record) return true;
    if (myBid == null) return !shouldDropUserBidEntry(record, marketId, removedBidId);
    return marketIdFromUserBidRecord(record) !== marketId;
  });
  if (myBid == null) return filtered;
  return [
    ...filtered,
    {
      ...existing,
      marketId,
      id: myBid.id,
      money: myBid.money,
      bid: { ...asRecord(existing?.bid), id: myBid.id, money: myBid.money, status: "pending" },
    },
  ];
}

function snapshotHasUserBids(record: Record<string, unknown>): boolean {
  if (Array.isArray(record.userBids)) return true;
  const nested = asRecord(record.market);
  return Array.isArray(nested?.userBids);
}

/** Updates cached market snapshot bid state for one listing (optimistic UI). */
export function patchMarketSnapshotBid(
  snapshot: unknown,
  marketId: string,
  myBid: UserBidRef | null,
  options: PatchMarketBidOptions = {},
): unknown {
  if (Array.isArray(snapshot)) {
    const patched = patchMarketSnapshotBid({ marketPlayers: snapshot }, marketId, myBid, options);
    return patched;
  }
  const record = asRecord(snapshot);
  if (!record) return snapshot;

  const removedBidId = options.removedBidId ?? null;
  const next: Record<string, unknown> = { ...record };
  const listing = marketItems(snapshot).find((item) => idText(item.id) === marketId);
  const hadBid = asRecord(listing?.bid) != null || userBidsByMarketId(snapshot).has(marketId);
  const delta = Number(myBid != null) - Number(hadBid);

  if (Array.isArray(record.marketPlayers)) {
    next.marketPlayers = record.marketPlayers.map((entry) => {
      const item = asRecord(entry);
      return item ? patchListingBid(item, marketId, myBid, delta) : entry;
    });
  }

  const nestedMarket = asRecord(record.market);
  if (nestedMarket && Array.isArray(nestedMarket.marketPlayers)) {
    next.market = {
      ...nestedMarket,
      marketPlayers: nestedMarket.marketPlayers.map((entry) => {
        const item = asRecord(entry);
        return item ? patchListingBid(item, marketId, myBid, delta) : entry;
      }),
    };
  }

  if (snapshotHasUserBids(record) || myBid != null || removedBidId) {
    const patched = patchUserBidsList(userBidRecords(snapshot), marketId, myBid, removedBidId);
    next.userBids = patched;
    if (nestedMarket) {
      next.market = { ...(asRecord(next.market) ?? nestedMarket), userBids: patched };
    }
  }

  return next;
}
