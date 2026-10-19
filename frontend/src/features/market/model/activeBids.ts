import { asFiniteNumber, asRecord, idText, text } from "../../../api/mappers";
import {
  catalogById, expiryOf, marketIdFromUserBid, marketItems, userBidRecords,
} from "./listing";
import { isLocalBidId } from "./pendingBids";
import { marketRow, type MarketRow } from "./row";

// Same terminal vocabulary as the existing received-offer reader. Unknown values
// remain visible and make projections incomplete; only pending authorizes writes.
const TERMINAL = new Set(["accepted", "rejected", "cancelled", "canceled", "expired"]);

export type ActiveBid = {
  key: string;
  id: string | null;
  marketId: string | null;
  playerId: string | null;
  playerTeamId: string | null;
  name: string;
  photoUrl: string | null;
  seller: string | null;
  money: number | null;
  status: string | null;
  expiresAt: number | null;
  confirmed: boolean;
  issues: string[];
  actionRow: MarketRow | null;
};

export type ActiveBids = { bids: ActiveBid[]; complete: boolean; spending: number | null };
type Candidate = {
  id: string | null; marketId: string | null; money: number | null;
  status: string | null; expiresAt: number | null; invalidExpiry: boolean;
  item: Record<string, unknown> | null;
};

/** One collection for the table, commitments, squad slots and My bids sheet. */
export function normalizeActiveBids(snapshot: unknown, catalog: unknown, now: number): ActiveBids {
  const items = marketItems(snapshot);
  const candidates: Candidate[] = [];
  function add(record: Record<string, unknown>, marketId: string | null,
    item: Record<string, unknown> | null, listingBid = false) {
    const nestedBid = asRecord(record.bid);
    const bid = nestedBid ?? record;
    const rawExpiry = text(bid.expirationDate) ?? text(record.expirationDate)
      ?? text(item?.expirationDate) ?? text(asRecord(item?.playerMarket)?.expirationDate);
    const parsed = rawExpiry == null ? null : Date.parse(rawExpiry);
    const money = asFiniteNumber(bid.money) ?? asFiniteNumber(record.money);
    candidates.push({
      id: idText(nestedBid?.id) ?? idText(record.bidId)
        ?? (listingBid ? null : idText(record.id)), marketId,
      money: money != null && Number.isSafeInteger(money) && money > 0 ? money : null,
      status: (text(bid.status) ?? text(record.status))?.toLowerCase() ?? null,
      expiresAt: parsed != null && Number.isFinite(parsed) ? parsed : expiryOf(item ?? {}),
      invalidExpiry: parsed != null && !Number.isFinite(parsed), item,
    });
  }
  for (const item of items) {
    if (asRecord(item.bid)) add(item, idText(item.id), item, true);
  }
  for (const record of userBidRecords(snapshot)) {
    const marketId = marketIdFromUserBid(record);
    const listing = items.find((item) => idText(item.id) === marketId);
    const embedded = asRecord(record.marketPlayer) ?? asRecord(record.playerMarket);
    // Embedded identity is useful even when the listing is absent from the board.
    const item = listing ?? { ...record, ...embedded, id: marketId };
    add(record, marketId, item);
  }

  const groups: Candidate[][] = [];
  for (const candidate of candidates) {
    const matches = groups.filter((entries) => entries.some((other) =>
      (candidate.id != null && candidate.id === other.id) ||
      (candidate.marketId != null && candidate.marketId === other.marketId &&
        (!candidate.id || !other.id || isLocalBidId(candidate.id) || isLocalBidId(other.id)))));
    const group = matches[0];
    if (!group) groups.push([candidate]);
    else {
      group.push(candidate);
      for (const extra of matches.slice(1)) {
        group.push(...extra);
        groups.splice(groups.indexOf(extra), 1);
      }
    }
  }
  const index = catalogById(catalog);
  const bids: ActiveBid[] = [];
  for (const [groupIndex, entries] of groups.entries()) {
    const statuses = entries.map((entry) => entry.status).filter((s) => s != null);
    // An authoritative terminal copy supersedes an older pending copy of that bid.
    if (statuses.some((status) => TERMINAL.has(status))) continue;
    const expiries = entries.flatMap((entry) => entry.expiresAt == null ? [] : [entry.expiresAt]);
    const expiresAt = expiries.length ? Math.min(...expiries) : null;
    if (expiresAt != null && expiresAt <= now) continue;
    const id = entries.find((entry) => entry.id && !isLocalBidId(entry.id))?.id
      ?? entries.find((entry) => entry.id)?.id ?? null;
    const marketIds = [...new Set(entries.flatMap((entry) => entry.marketId ? [entry.marketId] : []))];
    const marketId = marketIds.length === 1 ? marketIds[0] : null;
    const amounts = [...new Set(entries.flatMap((entry) => entry.money == null ? [] : [entry.money]))];
    const money = amounts.length === 1 ? amounts[0] : null;
    const status = statuses.find((value) => value !== "pending") ?? statuses[0] ?? null;
    const issues: string[] = [];
    if (money == null) issues.push(amounts.length > 1 ? "Conflicting bid amounts." : "Bid amount unavailable.");
    if (status !== "pending") issues.push("Pending status could not be confirmed.");
    if (!id) issues.push("Bid identifier unavailable.");
    if (!marketId) issues.push("Listing identifier unavailable.");
    if (entries.some((entry) => entry.invalidExpiry)) issues.push("Bid expiration could not be confirmed.");
    const item = entries.find((entry) => entry.item && items.includes(entry.item))?.item
      ?? entries.find((entry) => entry.item)?.item;
    const row = item ? marketRow(item, groupIndex, { catalog: index, history: new Map() }) : null;
    const confirmed = !!id && !isLocalBidId(id) && status === "pending";
    const actionRow = issues.length === 0 && confirmed && row && marketId && money != null
      ? { ...row, marketId, myBid: { id: id!, money }, expiresAt } : null;
    bids.push({ key: id ?? `unknown-${marketId ?? groupIndex}`, id, marketId,
      playerId: row?.playerId ?? null, playerTeamId: row?.playerTeamId ?? null,
      name: row && row.name !== "Player" ? row.name : `Player unavailable (${marketId ?? id ?? groupIndex + 1})`,
      photoUrl: row?.photoUrl ?? null,
      seller: item && (items.includes(item) || item.sellerTeam || item.seller || item.playerTeam)
        ? row?.seller ?? null : null,
      money, status, expiresAt, confirmed, issues, actionRow });
  }
  bids.sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity)
    || (a.marketId ?? a.key).localeCompare(b.marketId ?? b.key) || a.key.localeCompare(b.key));
  const record = asRecord(snapshot);
  const source = asRecord(record?.market) ?? record;
  const knownSnapshot = Array.isArray(snapshot) || Array.isArray(record?.market)
    || ["marketPlayers", "userBids", "players", "items", "data"].some((key) => Array.isArray(source?.[key]));
  const complete = knownSnapshot && bids.every((bid) => bid.money != null
    && bid.id != null && bid.status === "pending"
    && !bid.issues.includes("Bid expiration could not be confirmed."));
  return { bids, complete,
    spending: complete ? bids.reduce((sum, bid) => sum + bid.money!, 0) : null };
}

export type BalanceSemantics = "unknown" | "gross" | "net";
export type BidProjection = { spending: number | null; available: number | null;
  estimated: boolean; complete: boolean };

/** Cash projection; borrowing and expected sales never enter this calculation. */
export function projectBids(balance: number | null, active: ActiveBids,
  semantics: BalanceSemantics = "unknown"): BidProjection {
  const knownBalance = balance != null && Number.isFinite(balance);
  return {
    spending: active.spending,
    available: knownBalance && active.spending != null
      ? balance - (semantics === "net" ? 0 : active.spending) : null,
    estimated: semantics === "unknown", complete: knownBalance && active.complete,
  };
}
