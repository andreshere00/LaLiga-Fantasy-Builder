import { describe, expect, it } from "vitest";

import type { MarketRow } from "../model/row";
import {
  bidRangeAvailable,
  isValidBidAmount,
  resolveMarketActionOffers,
  resolveMarketActions,
  squadSlotAvailableForNewBid,
  usesDirectOfferBid,
} from "./marketActions";

function baseRow(overrides: Partial<MarketRow> = {}): MarketRow {
  return {
    id: "1",
    marketId: "1",
    playerId: "p1",
    playerTeamId: "pt1",
    name: "Player",
    positionId: 4,
    photoUrl: null,
    teamBadgeUrl: null,
    points: null,
    form: null,
    formRecent: [],
    formRecentWeeks: [],
    averagePoints: null,
    marketValue: 100,
    variation: null,
    variationPercent: null,
    availability: "available",
    expiresAt: Date.now() + 60_000,
    seller: "LALIGA",
    sellerTeamId: null,
    sellerKind: "laliga",
    buyoutClause: null,
    clauseUnlockAt: null,
    isShielded: false,
    myBid: null,
    directOffer: false,
    valueHistory: [],
    ...overrides,
  };
}

function baseContext(overrides: Partial<Parameters<typeof resolveMarketActions>[1]> = {}) {
  return {
    money: 200,
    now: Date.parse("2026-01-01T12:00:00Z"),
    callerTeamId: "me",
    squadPlayerCount: 18,
    activeBidCount: 0,
    squadMarketValue: 1_000_000,
    ...overrides,
  };
}

describe("isValidBidAmount", () => {
  it("isValidBidAmount_requires_strict_bounds", () => {
    expect(isValidBidAmount(99, 100, 200, 1_000_000)).toBe(false);
    expect(isValidBidAmount(100, 100, 200, 1_000_000)).toBe(true);
    expect(isValidBidAmount(200, 100, 200, 1_000_000)).toBe(false);
    expect(isValidBidAmount(150, 100, 200, 1_000_000)).toBe(true);
    expect(isValidBidAmount(150.5, 100, 200, 1_000_000)).toBe(false);
  });

  it("isValidBidAmount_allows_debt_within_twenty_percent_of_squad_value", () => {
    const squadValue = 100_000_000;
    const money = -19_000_000;
    expect(isValidBidAmount(739_427, 739_000, money, squadValue)).toBe(true);
    expect(isValidBidAmount(2_500_000, 739_000, money, squadValue)).toBe(false);
  });
});

describe("bidRangeAvailable", () => {
  it("bidRangeAvailable_true_for_negative_balance_with_debt_headroom", () => {
    expect(bidRangeAvailable(739_000, -19_000_000, 100_000_000)).toBe(true);
  });

  it("bidRangeAvailable_false_when_debt_headroom_too_small", () => {
    expect(bidRangeAvailable(739_000, -20_000_000, 50_000_000)).toBe(false);
  });
});

describe("squadSlotAvailableForNewBid", () => {
  it("squadSlotAvailableForNewBid_requires_room_under_cap", () => {
    expect(
      squadSlotAvailableForNewBid({
        money: 1,
        now: 0,
        callerTeamId: "me",
        squadPlayerCount: 23,
        activeBidCount: 0,
        squadMarketValue: 1,
      }),
    ).toBe(true);
    expect(
      squadSlotAvailableForNewBid({
        money: 1,
        now: 0,
        callerTeamId: "me",
        squadPlayerCount: 23,
        activeBidCount: 1,
        squadMarketValue: 1,
      }),
    ).toBe(false);
    expect(
      squadSlotAvailableForNewBid({
        money: 1,
        now: 0,
        callerTeamId: "me",
        squadPlayerCount: 24,
        activeBidCount: 0,
        squadMarketValue: 1,
      }),
    ).toBe(false);
  });
});

describe("resolveMarketActions", () => {
  it("resolveMarketActions_offers_hire_for_laliga_listing", () => {
    const actions = resolveMarketActions(baseRow(), baseContext());
    expect(actions.some((action) => action.type === "bid" && action.kind === "hire")).toBe(true);
  });

  it("resolveMarketActionOffers_lists_modify_and_cancel_when_bid_exists", () => {
    const offers = resolveMarketActionOffers(
      baseRow({ myBid: { id: "b1", money: 150 } }),
      baseContext(),
    );
    expect(offers.map((offer) => offer.label)).toEqual(["Modify bid", "Cancel bid"]);
    expect(offers.every((offer) => offer.enabled)).toBe(true);
  });

  it("resolveMarketActionOffers_hides_clause_when_bid_exists", () => {
    const offers = resolveMarketActionOffers(
      baseRow({
        myBid: { id: "b1", money: 150 },
        sellerKind: "opponent",
        buyoutClause: 50,
        clauseUnlockAt: Date.parse("2025-01-01T00:00:00Z"),
      }),
      baseContext(),
    );
    expect(offers.some((offer) => offer.type === "pay-clause")).toBe(false);
  });

  it("resolveMarketActions_offers_modify_when_bid_exists", () => {
    const actions = resolveMarketActions(
      baseRow({ myBid: { id: "b1", money: 150 } }),
      baseContext(),
    );
    expect(actions.some((action) => action.type === "bid" && action.kind === "modify")).toBe(
      true,
    );
  });

  it("resolveMarketActions_skips_bid_when_no_integer_in_range", () => {
    const actions = resolveMarketActions(baseRow({ marketValue: 100 }), {
      ...baseContext(),
      money: 100,
    });
    expect(actions.some((action) => action.type === "bid")).toBe(false);
  });

  it("usesDirectOfferBid_true_for_opponent_direct_offer_listing", () => {
    expect(
      usesDirectOfferBid(
        baseRow({
          sellerKind: "opponent",
          directOffer: true,
          playerTeamId: "pt-9",
        }),
        "purchase",
      ),
    ).toBe(true);
    expect(usesDirectOfferBid(baseRow({ sellerKind: "laliga" }), "hire")).toBe(false);
  });

  it("resolveMarketActionOffers_blocks_hire_for_coaches", () => {
    const offers = resolveMarketActionOffers(baseRow({ positionId: 5 }), baseContext());
    const bid = offers.find((offer) => offer.type === "bid");
    expect(bid?.enabled).toBe(false);
    expect(bid?.disabledReason).toContain("premium");
  });

  it("resolveMarketActionOffers_lists_disabled_hire_when_squad_full", () => {
    const offers = resolveMarketActionOffers(baseRow(), {
      ...baseContext(),
      squadPlayerCount: 24,
      activeBidCount: 0,
    });
    const bid = offers.find((offer) => offer.type === "bid");
    expect(bid?.enabled).toBe(false);
    expect(bid?.disabledReason).toContain("24");
  });

  it("resolveMarketActionOffers_enables_hire_with_negative_balance_and_debt_room", () => {
    const offers = resolveMarketActionOffers(baseRow({ marketValue: 739_000 }), {
      ...baseContext(),
      money: -19_000_000,
      squadMarketValue: 100_000_000,
    });
    const bid = offers.find((offer) => offer.type === "bid");
    expect(bid?.enabled).toBe(true);
    expect(bid?.label).toBe("Hire");
  });

  it("resolveMarketActionOffers_lists_disabled_bid_when_debt_exceeded", () => {
    const offers = resolveMarketActionOffers(baseRow({ marketValue: 739_000 }), {
      ...baseContext(),
      money: -20_000_000,
      squadMarketValue: 50_000_000,
    });
    const bid = offers.find((offer) => offer.type === "bid");
    expect(bid?.enabled).toBe(false);
    expect(bid?.disabledReason).toContain("20%");
  });

  it("resolveMarketActions_offers_clause_when_unlocked", () => {
    const actions = resolveMarketActions(
      baseRow({
        sellerKind: "opponent",
        seller: "Rival",
        sellerTeamId: "t2",
        buyoutClause: 50,
        clauseUnlockAt: Date.parse("2025-01-01T00:00:00Z"),
      }),
      baseContext(),
    );
    expect(actions.some((action) => action.type === "pay-clause")).toBe(true);
  });

  it("resolveMarketActions_blocks_clause_when_lock_missing", () => {
    const actions = resolveMarketActions(
      baseRow({
        buyoutClause: 50,
        clauseUnlockAt: null,
      }),
      baseContext(),
    );
    expect(actions.some((action) => action.type === "pay-clause")).toBe(false);
  });
});
