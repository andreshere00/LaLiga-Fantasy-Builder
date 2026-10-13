// ---- Mocks, fixtures & helpers ---- //
import { describe, expect, it } from "vitest";
import { squadCards } from "../../../api/mappers";
import { receivedOffers } from "./receivedOffers";

const now = Date.parse("2026-10-13T12:00:00Z");
const [card] = squadCards([{ playerTeamId: "pt-1", playerMaster: { name: "Player" },
  playerMarket: { id: "listing-1" } }], null);
const offer = { id: "o1", money: 2000000, status: "pending" };

// ---- Happy path ---- //
describe("receivedOffers", () => {
  it("receivedOffers_both_senders_preserves_origin_amount_and_listing", () => {
    const rows = receivedOffers(card, { offers: [
      { ...offer, bidderName: "LaLiga" },
      { ...offer, id: "o2", bidderId: 7, bidder: { managerName: "Opponent" } },
    ] }, now);
    expect(rows.map((row) => [row.sender, row.money, row.marketId, row.unavailableReason]))
      .toEqual([["LaLiga", 2000000, "listing-1", null], ["Opponent", 2000000, "listing-1", null]]);
  });

  it("receivedOffers_direct_offer_uses_explicit_market_id_without_listing", () => {
    const rows = receivedOffers({ ...card, listingId: null },
      { offers: [{ ...offer, marketId: "direct-1" }] }, now);
    expect(rows[0].marketId).toBe("direct-1");
    expect(rows[0].unavailableReason).toBeNull();
  });

  // ---- Error paths ---- //
  it.each([
    { id: null }, { money: null }, { money: 1.5 }, { money: 0 },
    { status: null }, { status: "unknown" }, { expirationDate: "not-a-date" },
  ])("receivedOffers_incomplete_offer_blocks_action: %j", (override) => {
    expect(receivedOffers(card, { offers: [{ ...offer, ...override }] }, now)[0].unavailableReason)
      .not.toBeNull();
  });

  it("receivedOffers_missing_listing_blocks_action", () => {
    expect(receivedOffers({ ...card, listingId: null }, { offers: [offer] }, now)[0].unavailableReason)
      .not.toBeNull();
  });

  // ---- Edge cases ---- //
  it("receivedOffers_closed_expired_and_duplicate_offers_are_excluded", () => {
    expect(receivedOffers(card, { offers: [offer, offer,
      { ...offer, id: "o2", status: "accepted" },
      { ...offer, id: "o3", expirationDate: "2026-10-12T12:00:00Z" },
    ] }, now)).toHaveLength(1);
  });

  it("receivedOffers_unknown_bidder_is_not_assumed_to_be_laliga", () => {
    expect(receivedOffers(card, { offers: [offer] }, now)[0].sender).toBe("Sender unavailable");
  });

  it("receivedOffers_explicit_market_flag_identifies_laliga_without_a_bidder", () => {
    expect(receivedOffers(card, { offers: [{ ...offer, isFromMarket: true }] }, now)[0].sender)
      .toBe("LaLiga");
  });

  it("receivedOffers_explicit_opponent_flag_does_not_identify_laliga", () => {
    expect(receivedOffers(card, { offers: [{ ...offer, isFromMarket: false }] }, now)[0].sender)
      .toBe("Other manager");
  });

  it("receivedOffers_bid_cannot_be_answered_as_offer", () => {
    const [bid] = receivedOffers(card, { bids: [offer] }, now);
    expect(bid.isBid).toBe(true);
    expect(bid.unavailableReason).not.toBeNull();
  });

  it("receivedOffers_empty_payload_returns_empty_list", () => {
    expect(receivedOffers(card, {}, now)).toEqual([]);
  });
});
