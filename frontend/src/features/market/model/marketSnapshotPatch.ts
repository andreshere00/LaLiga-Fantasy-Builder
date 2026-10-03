import { asRecord, idText } from "../../../api/mappers";
import type { UserBidRef } from "./listing";
import { userBidRecords } from "./listing";

function patchListingBid(
  item: Record<string, unknown>,
  marketId: string,
  myBid: UserBidRef | null,
): Record<string, unknown> {
  if (idText(item.id) !== marketId) return item;
  if (myBid == null) {
    const { bid: _removed, ...rest } = item;
    return rest;
  }
  return {
    ...item,
    bid: {
      ...(asRecord(item.bid) ?? {}),
      id: myBid.id,
      money: myBid.money,
      status: "pending",
    },
  };
}

function patchUserBidsList(
  bids: unknown[],
  marketId: string,
  myBid: UserBidRef | null,
): unknown[] {
  const filtered = bids.filter((entry) => {
    const record = asRecord(entry);
    if (!record) return true;
    const entryMarketId =
      idText(record.marketId) ??
      idText(record.marketPlayerId) ??
      idText(asRecord(record.marketPlayer)?.id);
    return entryMarketId !== marketId;
  });
  if (myBid == null) return filtered;
  return [
    ...filtered,
    {
      marketId,
      id: myBid.id,
      money: myBid.money,
      bid: { id: myBid.id, money: myBid.money, status: "pending" },
    },
  ];
}

/** Updates cached market snapshot bid state for one listing (optimistic UI). */
export function patchMarketSnapshotBid(
  snapshot: unknown,
  marketId: string,
  myBid: UserBidRef | null,
): unknown {
  const record = asRecord(snapshot);
  if (!record) return snapshot;

  const next: Record<string, unknown> = { ...record };

  if (Array.isArray(record.marketPlayers)) {
    next.marketPlayers = record.marketPlayers.map((entry) => {
      const item = asRecord(entry);
      return item ? patchListingBid(item, marketId, myBid) : entry;
    });
  }

  const nestedMarket = asRecord(record.market);
  if (nestedMarket && Array.isArray(nestedMarket.marketPlayers)) {
    next.market = {
      ...nestedMarket,
      marketPlayers: nestedMarket.marketPlayers.map((entry) => {
        const item = asRecord(entry);
        return item ? patchListingBid(item, marketId, myBid) : entry;
      }),
    };
  }

  if (Array.isArray(record.userBids) || myBid != null) {
    const current = userBidRecords(snapshot);
    next.userBids = patchUserBidsList(current, marketId, myBid);
  }

  return next;
}
