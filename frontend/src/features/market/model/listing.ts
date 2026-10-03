import { asFiniteNumber, asRecord, idText, text } from "../../../api/mappers";

export const LALIGA_SELLER = "LALIGA";
const LIST_KEYS: readonly string[] = ["marketPlayers", "market", "players", "items", "data"];

/** Extracts the listing records from a market snapshot, whatever the wrapper key. */
export function marketItems(snapshot: unknown): Record<string, unknown>[] {
  const toRecords = (list: unknown[]) =>
    list.map(asRecord).filter((item): item is Record<string, unknown> => item != null);
  if (Array.isArray(snapshot)) return toRecords(snapshot);
  const record = asRecord(snapshot);
  if (!record) return [];
  for (const key of LIST_KEYS) {
    const nested = record[key];
    if (Array.isArray(nested)) return toRecords(nested);
    if (asRecord(nested)) {
      const inner = marketItems(nested);
      if (inner.length > 0) return inner;
    }
  }
  return [];
}

export function masterOf(item: Record<string, unknown>): Record<string, unknown> | null {
  const playerTeam = asRecord(item.playerTeam);
  return (
    asRecord(item.playerMaster) ??
    asRecord(playerTeam?.playerMaster) ??
    asRecord(item.player)
  );
}

/** Master player id of a market item, used to join catalog and value history. */
export function masterIdOf(item: Record<string, unknown>): string | null {
  const master = masterOf(item);
  return idText(master?.id) ?? idText(item.playerMasterId) ?? null;
}

function managerNameOf(value: unknown): string | null {
  const record = asRecord(value);
  return text(record?.managerName) ?? text(record?.name) ?? null;
}

export function sellerNameOf(item: Record<string, unknown>): string {
  const sellerTeam = asRecord(item.sellerTeam);
  const fromSellerTeam = managerNameOf(sellerTeam?.manager);
  if (fromSellerTeam) return fromSellerTeam;

  const playerTeam = asRecord(item.playerTeam);
  const fromPlayerTeam = managerNameOf(playerTeam?.manager);
  if (fromPlayerTeam) return fromPlayerTeam;

  for (const candidate of [item.seller, item.manager, item.team]) {
    const name = managerNameOf(candidate) ?? text(candidate);
    if (name) return name;
  }

  return LALIGA_SELLER;
}

export function sellerTeamIdOf(item: Record<string, unknown>): string | null {
  const sellerTeam = asRecord(item.sellerTeam);
  const fromSeller = idText(sellerTeam?.id) ?? idText(sellerTeam?.teamId);
  if (fromSeller) return fromSeller;
  const playerTeam = asRecord(item.playerTeam);
  return idText(playerTeam?.teamId) ?? idText(playerTeam?.id);
}

export function expiryOf(item: Record<string, unknown>): number | null {
  const market = asRecord(item.playerMarket);
  const raw = text(item.expirationDate) ?? text(market?.expirationDate);
  const time = raw == null ? Number.NaN : Date.parse(raw);
  return Number.isFinite(time) ? time : null;
}

export type UserBidRef = { id: string; money: number };

function bidRefFromRecord(record: Record<string, unknown>): UserBidRef | null {
  const bid = asRecord(record.bid);
  const id = idText(bid?.id) ?? idText(record.bidId) ?? idText(record.id);
  const money = asFiniteNumber(bid?.money) ?? asFiniteNumber(record.money);
  if (!id || money == null) return null;
  return { id, money };
}

function marketIdFromUserBid(record: Record<string, unknown>): string | null {
  const marketPlayer = asRecord(record.marketPlayer);
  return (
    idText(record.marketId) ??
    idText(record.marketPlayerId) ??
    idText(marketPlayer?.id) ??
    idText(asRecord(record.playerMarket)?.id)
  );
}

/** User bids keyed by market listing id (``userBids`` on the market snapshot). */
export function userBidsByMarketId(snapshot: unknown): Map<string, UserBidRef> {
  const map = new Map<string, UserBidRef>();
  for (const raw of userBidRecords(snapshot)) {
    const marketId = marketIdFromUserBid(raw);
    const bid = bidRefFromRecord(raw);
    if (marketId && bid) map.set(marketId, bid);
  }
  return map;
}

function userBidArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item): item is Record<string, unknown> => item != null);
}

/** Pending bids from a market snapshot outside listing rows. */
export function userBidRecords(snapshot: unknown): Record<string, unknown>[] {
  const record = asRecord(snapshot);
  if (!record) return [];
  const nested = asRecord(record.market);
  const combined = [...userBidArray(record.userBids), ...userBidArray(nested?.userBids)];
  if (combined.length === 0) return [];
  const byBidId = new Map<string, Record<string, unknown>>();
  for (const entry of combined) {
    const ref = bidRefFromRecord(entry);
    const key = ref?.id ?? JSON.stringify(entry);
    byBidId.set(key, entry);
  }
  return [...byBidId.values()];
}

/** Distinct active user bids on the market (listing bids plus ``userBids``). */
export function activeUserBidCount(
  rows: readonly { myBid: { id: string } | null }[],
  snapshot: unknown,
): number {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.myBid?.id) ids.add(row.myBid.id);
  }
  for (const bid of userBidRecords(snapshot)) {
    const ref = bidRefFromRecord(bid);
    if (ref?.id) ids.add(ref.id);
  }
  return ids.size;
}

/** Indexes catalog entries by master id. */
export function catalogById(catalog: unknown): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(catalog)) return map;
  for (const entry of catalog) {
    const record = asRecord(entry);
    const id = idText(record?.id);
    if (record && id) map.set(id, record);
  }
  return map;
}
