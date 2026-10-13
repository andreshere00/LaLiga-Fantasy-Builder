import { asFiniteNumber, asRecord, idText, text, type SquadCard } from "../../../api/mappers";

export type ReceivedOffer = {
  key: string;
  id: string | null;
  playerTeamId: string;
  marketId: string | null;
  player: SquadCard;
  sender: string;
  money: number | null;
  status: string | null;
  expiresAt: number | null;
  isBid: boolean;
  unavailableReason: string | null;
};

const CLOSED_STATUSES = new Set(["accepted", "rejected", "cancelled", "canceled", "expired"]);

/** Uses the explicit market-origin flag; a missing bidder alone never means LaLiga. */
export function receivedOffers(card: SquadCard, payload: unknown, now: number): ReceivedOffer[] {
  const record = asRecord(payload);
  const rows = [
    ...(Array.isArray(record?.offers) ? record.offers.map((value) => ({ value, isBid: false })) : []),
    ...(Array.isArray(record?.bids) ? record.bids.map((value) => ({ value, isBid: true })) : []),
  ];
  const seen = new Set<string>();
  return rows.flatMap(({ value, isBid }, index) => {
    const offer = asRecord(value);
    if (!offer) return [];
    const status = text(offer.status)?.toLowerCase() ?? null;
    if (status && CLOSED_STATUSES.has(status)) return [];
    const expiration = text(offer.expirationDate);
    const parsedExpiration = expiration ? Date.parse(expiration) : null;
    const expiresAt = parsedExpiration != null && Number.isFinite(parsedExpiration)
      ? parsedExpiration : null;
    if (expiresAt != null && expiresAt <= now) return [];
    const id = idText(offer.id);
    const key = `${card.id}:${isBid ? "bid" : "offer"}:${id ?? `unknown-${index}`}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const bidder = asRecord(offer.bidder);
    const manager = asRecord(offer.manager) ?? asRecord(bidder?.manager);
    const sender = text(offer.bidderName) ?? text(manager?.managerName)
      ?? text(bidder?.managerName) ?? text(bidder?.name)
      ?? (offer.isFromMarket === true ? "LaLiga"
        : idText(offer.bidderId) ? `Manager #${idText(offer.bidderId)}`
        : offer.isFromMarket === false ? "Other manager" : "Sender unavailable");
    const marketId = idText(offer.marketId) ?? card.listingId;
    const money = asFiniteNumber(offer.money);
    const unavailableReason = isBid ? "Bids cannot be answered as offers."
      : !id || !marketId ? "The offer identifiers are unavailable."
      : money == null || !Number.isSafeInteger(money) || money <= 0 ? "The offer amount is unavailable."
      : status !== "pending" ? "The offer's pending status could not be confirmed."
      : expiration != null && expiresAt == null ? "The offer expiration could not be confirmed."
      : null;
    return [{ key, id, playerTeamId: card.id, marketId, player: card, sender, money,
      status, expiresAt, isBid, unavailableReason }];
  });
}
