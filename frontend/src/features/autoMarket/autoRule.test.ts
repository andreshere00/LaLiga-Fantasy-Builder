// ---- Mocks, fixtures & helpers ---- //
import { describe, expect, it } from "vitest";
import { parsePercent } from "../../api/format";
import type { AutoRule } from "../../api/autoMarket";
import {
  bulkSellWrites,
  favoriteRuleWrites,
  defaultDraft, draftFromRule, draftThreshold, reasonLabel, thresholdAmount, thresholdReached,
  validateDraft, type AutoRuleDraft, type AutoRuleTarget,
} from "./autoRule";

const NOW = new Date(2026, 10, 24, 12).getTime();
const sell: AutoRuleTarget = {
  side: "sell", playerId: "7", playerTeamId: "s7", name: "Pedri", marketValue: 100_000_000, clause: null, listed: false,
};
const buy: AutoRuleTarget = {
  side: "buy", playerId: "8", playerTeamId: "s8", name: "Gavi", marketValue: 90_000_000,
  clause: { amount: 92_000_000, unlockAt: NOW + 1000 }, listed: true,
};
const draft = (changes: Partial<AutoRuleDraft> = {}, target = sell): AutoRuleDraft => ({ ...defaultDraft(target), ...changes });

// ---- Happy path ---- //
describe("parsePercent", () => {
  it("parsePercent_accepts_decimal_point_comma_and_percent_sign", () => {
    expect(parsePercent("5")).toBe(5);
    expect(parsePercent("2,5")).toBe(2.5);
    expect(parsePercent(" 7.25 % ")).toBe(7.25);
  });
  it("parsePercent_rejects_signs_groups_and_text", () => {
    for (const raw of ["", "-1", "1,000.5", "1e3", "abc", "5,", ",5"]) expect(parsePercent(raw)).toBeNull();
  });
});

describe("thresholdAmount", () => {
  it("thresholdAmount_relative_sell_rounds_up_and_buy_rounds_down_like_the_server", () => {
    expect(thresholdAmount("sell", "relative", 1_000_001, 5, null)).toBe(1_050_002);
    expect(thresholdAmount("buy", "relative", 1_000_001, 5, null)).toBe(950_000);
    expect(thresholdAmount("buy", "relative", 100, 99, null)).toBe(1);
  });
  it("thresholdAmount_absolute_uses_the_amount_and_reached_follows_the_side", () => {
    expect(thresholdAmount("sell", "absolute", 1, null, 150_000_000)).toBe(150_000_000);
    expect(thresholdReached("sell", 105, 105)).toBe(true);
    expect(thresholdReached("sell", 105, 104)).toBe(false);
    expect(thresholdReached("buy", 90, 90)).toBe(true);
    expect(thresholdReached("buy", 90, 91)).toBe(false);
  });
});

describe("validateDraft", () => {
  it("validateDraft_relative_sell_builds_a_write_without_buy_only_fields", () => {
    const { write, errors } = validateDraft(sell, draft({ percent: "2,5" }), NOW);
    expect(errors).toEqual({});
    expect(write).toEqual({
      side: "sell", target: "market", playerId: "7", playerTeamId: "s7",
      triggerKind: "relative", triggerPercent: 2.5, priceMode: "threshold",
    });
  });
  it("validateDraft_absolute_market_buy_omits_the_squad_entry_and_carries_the_cap", () => {
    const { write } = validateDraft(buy, draft({
      kind: "absolute", amount: "85.000.000", maxSpend: "86.000.000", priceMode: "market_value",
    }, buy), NOW);
    expect(write).toEqual({
      side: "buy", target: "market", playerId: "8", triggerKind: "absolute",
      triggerAmount: 85_000_000, priceMode: "market_value", maxSpend: 86_000_000,
    });
  });
  it("validateDraft_clause_buy_keeps_the_entry_and_always_prices_at_the_threshold", () => {
    const { write } = validateDraft(buy, draft({ target: "clause", priceMode: "market_value" }, buy), NOW);
    expect(write).toMatchObject({ target: "clause", playerTeamId: "s8", priceMode: "threshold" });
  });
  it("validateDraft_deadline_becomes_the_end_of_that_local_day", () => {
    const { write } = validateDraft(sell, draft({ expires: "2026-11-30" }), NOW);
    expect(new Date(write!.expiresAt!).getTime()).toBe(new Date(2026, 10, 30, 23, 59, 59).getTime());
  });
});

describe("defaults and previews", () => {
  it("defaultDraft_starts_conservative_and_picks_the_only_possible_buy_target", () => {
    expect(defaultDraft(sell)).toMatchObject({ kind: "relative", percent: "5", priceMode: "threshold", maxSpend: "" });
    expect(defaultDraft(buy)).toMatchObject({ target: "market", maxSpend: "90,000,000" });
    expect(defaultDraft({ ...buy, listed: false })).toMatchObject({ target: "clause" });
  });
  it("draftThreshold_previews_only_valid_inputs", () => {
    expect(draftThreshold("sell", draft({ percent: "5" }), 100)).toBe(105);
    expect(draftThreshold("sell", draft({ percent: "600" }), 100)).toBeNull();
    expect(draftThreshold("buy", draft({ kind: "absolute", amount: "9" }, buy), 100)).toBe(9);
    expect(draftThreshold("sell", draft(), null)).toBeNull();
  });
  it("draftFromRule_restores_the_inputs_of_a_stored_rule", () => {
    const rule = {
      triggerKind: "absolute", triggerPercent: null, triggerAmount: 150_000_000, priceMode: "market_value",
      target: "market", maxSpend: null, expiresAt: new Date(2026, 10, 30, 23, 59, 59).toISOString(),
    } as AutoRule;
    expect(draftFromRule(rule)).toMatchObject({
      kind: "absolute", amount: "150,000,000", priceMode: "market_value", maxSpend: "", expires: "2026-11-30",
    });
  });
});

// ---- Error paths ---- //
describe("validateDraft errors", () => {
  it.each([
    [{ percent: "" }, "percent"], [{ percent: "600" }, "percent"], [{ percent: "0.05" }, "percent"],
    [{ percent: "1.234" }, "percent"], [{ kind: "absolute", amount: "" }, "amount"],
    [{ kind: "absolute", amount: "1.000.000.000" }, "amount"], [{ expires: "2026-11-23" }, "expires"],
  ] as const)("validateDraft_rejects_%j", (changes, field) => {
    const { write, errors } = validateDraft(sell, draft(changes as Partial<AutoRuleDraft>), NOW);
    expect(write).toBeNull();
    expect(Object.keys(errors)).toEqual([field]);
  });
  it("validateDraft_buy_needs_a_cap_and_a_buy_drop_below_100_percent", () => {
    expect(validateDraft(buy, draft({ maxSpend: "" }, buy), NOW).errors.maxSpend).toBeTruthy();
    expect(validateDraft(buy, draft({ percent: "100" }, buy), NOW).errors.percent).toBeTruthy();
    expect(validateDraft(buy, draft({ percent: "99" }, buy), NOW).write).not.toBeNull();
  });
  it("reasonLabel_explains_known_codes_and_never_echoes_unknown_ones", () => {
    expect(reasonLabel("squad_full")).toBe("Your squad is full.");
    expect(reasonLabel("fantasy_error")).toBe("Check your market to see what happened.");
    expect(reasonLabel(null)).toBeNull();
  });
});

describe("bulkSellWrites", () => {
  const cards = [{ id: "s1", masterPlayerId: "1", marketValue: 10, name: "A" }];
  const base = { side: "sell", target: "market", playerId: "1", playerTeamId: "s1" };
  it("bulkSellWrites_list_mode_lists_every_player_with_no_trigger_and_ignores_the_percentage", () => {
    expect(bulkSellWrites(cards, "list", "abc")).toEqual({
      percentError: null, writes: [{ ...base, triggerKind: "none", priceMode: "market_value" }],
    });
  });
  it("bulkSellWrites_offer_mode_lists_now_and_sells_to_an_offer_at_the_gain", () => {
    expect(bulkSellWrites(cards, "offer", "7,5").writes).toEqual([{
      ...base, triggerKind: "relative", triggerPercent: 7.5, priceMode: "threshold", listNow: true,
    }]);
  });
  it("bulkSellWrites_rise_mode_builds_relative_threshold_rules", () => {
    expect(bulkSellWrites(cards, "rise", "7,5").writes).toEqual([{
      ...base, triggerKind: "relative", triggerPercent: 7.5, priceMode: "threshold",
    }]);
  });
  it("bulkSellWrites_offer_and_rise_modes_with_a_bad_percentage_return_no_writes", () => {
    for (const mode of ["offer", "rise"] as const) expect(bulkSellWrites(cards, mode, "0").writes).toBeNull();
  });
});

describe("list-only and list-now sell drafts", () => {
  it("validateDraft_list_only_sell_sends_no_trigger_and_prices_at_the_market_value", () => {
    const { errors, write } = validateDraft(sell, draft({ kind: "none", listNow: true, percent: "zzz", priceMode: "threshold" }), NOW);
    expect(errors).toEqual({});
    expect(write).toEqual({
      side: "sell", target: "market", playerId: "7", playerTeamId: "s7",
      triggerKind: "none", priceMode: "market_value", listNow: true,
    });
  });
  it("validateDraft_list_now_sell_keeps_the_threshold_that_accepts_offers", () => {
    const { write } = validateDraft(sell, draft({ listNow: true, percent: "10" }), NOW);
    expect(write).toMatchObject({ triggerKind: "relative", triggerPercent: 10, listNow: true });
  });
  it("defaultDraft_lists_right_away_only_for_a_player_already_on_the_market", () => {
    expect(defaultDraft(sell).listNow).toBe(false);
    expect(defaultDraft({ ...sell, listed: true }).listNow).toBe(true);
  });
  it("thresholdAmount_for_a_list_only_rule_is_the_baseline", () => {
    expect(thresholdAmount("sell", "none", 100, null, null)).toBe(100);
  });
});

describe("favoriteRuleWrites", () => {
  const owned = { playerId: "9", playerTeamId: "s9", name: "Ferran", marketValue: 60_000_000 };
  const rival = { playerId: "55", playerTeamId: null, name: "Lamine", marketValue: null };

  it("favoriteRuleWrites_sell_at_market_value_lists_now_at_each_own_value", () => {
    const { writes } = favoriteRuleWrites("sell", [owned], "market", "");
    expect(writes).toEqual([{
      side: "sell", target: "market", playerId: "9", playerTeamId: "s9", triggerKind: "absolute",
      triggerAmount: 60_000_000, priceMode: "market_value", listNow: true,
    }]);
  });

  it("favoriteRuleWrites_buy_at_an_amount_caps_the_spend_at_that_amount", () => {
    const { writes } = favoriteRuleWrites("buy", [owned, rival], "amount", "70.000.000");
    expect(writes?.map((write) => [write.playerId, write.triggerAmount, write.maxSpend, write.priceMode]))
      .toEqual([["9", 70_000_000, 70_000_000, "threshold"], ["55", 70_000_000, 70_000_000, "threshold"]]);
  });

  it("favoriteRuleWrites_market_value_skips_players_without_a_known_value", () => {
    const { writes } = favoriteRuleWrites("buy", [owned, rival], "market", "");
    expect(writes?.map((write) => write.playerId)).toEqual(["9"]);
  });

  it("favoriteRuleWrites_an_invalid_amount_returns_an_error_and_no_rules", () => {
    const result = favoriteRuleWrites("buy", [owned], "amount", "abc");
    expect(result.writes).toBeNull();
    expect(result.amountError).toContain("whole euro amount");
  });
});
