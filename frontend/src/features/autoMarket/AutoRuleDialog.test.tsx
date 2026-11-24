// ---- Mocks, fixtures & helpers ---- //
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutoRule } from "../../api/autoMarket";
import { i18n } from "../../i18n";
import { AutoRuleDialog } from "./AutoRuleDialog";
import type { RuleDialogState } from "./AutoMarketProvider";
import type { AutoRuleTarget } from "./autoRule";

const sellTarget: AutoRuleTarget = {
  side: "sell", playerId: "7", playerTeamId: "s7", name: "Pedri", marketValue: 100_000_000, clause: null, listed: false,
};
const buyTarget: AutoRuleTarget = {
  side: "buy", playerId: "8", playerTeamId: "s8", name: "Gavi", marketValue: 90_000_000,
  clause: { amount: 92_000_000, unlockAt: Date.now() + 3_600_000 }, listed: true,
};

function open(state: RuleDialogState, props: Partial<Parameters<typeof AutoRuleDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(<AutoRuleDialog open state={state} money={200_000_000} pending={false} error={null}
    onClose={onClose} onConfirm={onConfirm} {...props} />);
  return { onConfirm, onClose };
}

afterEach(() => { cleanup(); void i18n.changeLanguage("en"); });

// ---- Happy path ---- //
describe("AutoRuleDialog", () => {
  it("AutoRuleDialog_sell_previews_the_threshold_and_arms_one_confirmed_write", () => {
    const { onConfirm } = open({ target: sellTarget, rule: null });
    expect(screen.getByRole("status").textContent).toContain("at least 105,000,000 € (now 100,000,000 €)");
    fireEvent.change(screen.getByLabelText("Percentage (%)"), { target: { value: "2,5" } });
    expect(screen.getByRole("status").textContent).toContain("102,500,000");
    fireEvent.click(screen.getByRole("button", { name: "Arm auto-sell" }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
      side: "sell", target: "market", playerId: "7", playerTeamId: "s7",
      triggerKind: "relative", triggerPercent: 2.5, priceMode: "threshold",
    });
  });

  it("AutoRuleDialog_sell_right_away_can_only_list_the_player_and_never_sell_automatically", () => {
    const { onConfirm } = open({ target: sellTarget, rule: null });
    fireEvent.click(screen.getByRole("button", { name: "Right away" }));
    fireEvent.click(screen.getByRole("button", { name: "Never, I choose" }));
    expect(screen.queryByLabelText("Percentage (%)")).toBeNull();
    expect(screen.queryByRole("button", { name: "At the market value" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Lists the player at 100,000,000 €");
    fireEvent.click(screen.getByRole("button", { name: "Arm auto-listing" }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
      side: "sell", target: "market", playerId: "7", playerTeamId: "s7",
      triggerKind: "none", priceMode: "market_value", listNow: true,
    });
  });

  it("AutoRuleDialog_sell_right_away_with_a_gain_lists_now_and_accepts_offers_from_it", () => {
    const { onConfirm } = open({ target: sellTarget, rule: null });
    fireEvent.click(screen.getByRole("button", { name: "Right away" }));
    fireEvent.click(screen.getByRole("button", { name: "From a gain on the value" }));
    expect(screen.getByRole("status").textContent).toContain("accepts an offer of at least 105,000,000 €");
    expect(screen.queryByText(/already true/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Arm auto-sell" }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ triggerKind: "relative", triggerPercent: 5, listNow: true }));
  });

  it("AutoRuleDialog_sell_back_to_waiting_for_the_value_drops_the_list_only_choice", () => {
    open({ target: sellTarget, rule: null });
    fireEvent.click(screen.getByRole("button", { name: "Right away" }));
    fireEvent.click(screen.getByRole("button", { name: "Never, I choose" }));
    fireEvent.click(screen.getByRole("button", { name: "When the value is reached" }));
    expect(screen.queryByRole("button", { name: "Never, I choose" })).toBeNull();
    expect(screen.getByLabelText("Percentage (%)")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Arm auto-sell" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("AutoRuleDialog_buy_offers_market_or_clause_and_hides_price_mode_for_a_clause", () => {
    const { onConfirm } = open({ target: buyTarget, rule: null });
    expect(screen.getByRole("button", { name: "At the market value" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pay the release clause" }));
    expect(screen.queryByRole("button", { name: "At the market value" })).toBeNull();
    expect(screen.getByText(/unlocks in/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Arm auto-buy" }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      side: "buy", target: "clause", playerTeamId: "s8", maxSpend: 90_000_000, priceMode: "threshold",
    }));
  });

  it("AutoRuleDialog_edit_restores_the_stored_rule_and_titles_it_as_an_edit", () => {
    const rule = {
      id: 3, side: "sell", target: "market", triggerKind: "absolute", triggerPercent: null,
      triggerAmount: 150_000_000, priceMode: "market_value", maxSpend: null, expiresAt: null,
    } as AutoRule;
    open({ target: sellTarget, rule });
    expect(screen.getByText("Edit auto-sell")).toBeTruthy();
    expect((screen.getByLabelText("Amount (€)") as HTMLInputElement).value).toBe("150000000");
  });

  it("AutoRuleDialog_localizes_copy_when_the_language_changes", async () => {
    open({ target: sellTarget, rule: null });
    await act(() => i18n.changeLanguage("es"));
    expect(screen.getByRole("button", { name: "Activar venta automática" })).toBeTruthy();
    expect(screen.getByLabelText("Porcentaje (%)")).toBeTruthy();
  });

  // ---- Error paths ---- //
  it("AutoRuleDialog_invalid_inputs_disable_arming_and_explain_the_fix", () => {
    const { onConfirm } = open({ target: sellTarget, rule: null });
    const arm = screen.getByRole("button", { name: "Arm auto-sell" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Percentage (%)"), { target: { value: "900" } });
    expect(arm.disabled).toBe(true);
    const input = screen.getByLabelText("Percentage (%)");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/Enter a percentage from/)).toBeTruthy();
    fireEvent.click(arm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("AutoRuleDialog_buy_requires_a_spending_cap", () => {
    open({ target: buyTarget, rule: null });
    fireEvent.change(screen.getByLabelText("Most this rule may spend (€)"), { target: { value: "" } });
    expect((screen.getByRole("button", { name: "Arm auto-buy" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Set the most this rule may spend, as a whole euro amount.")).toBeTruthy();
  });

  it("AutoRuleDialog_warns_when_the_threshold_is_already_reached", () => {
    open({ target: sellTarget, rule: null });
    fireEvent.click(screen.getByRole("button", { name: "Reaches an amount" }));
    fireEvent.change(screen.getByLabelText("Amount (€)"), { target: { value: "99.000.000" } });
    expect(screen.getByText(/already true/)).toBeTruthy();
  });

  it("AutoRuleDialog_pending_keeps_the_draft_blocked_and_shows_a_server_error", () => {
    const { onClose } = open({ target: sellTarget, rule: null }, { pending: true, error: "The rule could not be saved. Try again." });
    expect(screen.getByRole("alert").textContent).toBe("The rule could not be saved. Try again.");
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Arming…" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  // ---- Edge cases ---- //
  it("AutoRuleDialog_without_a_target_renders_nothing", () => {
    render(<AutoRuleDialog open={false} state={null} money={null} pending={false} error={null}
      onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("AutoRuleDialog_without_a_balance_still_arms_and_says_the_balance_is_unavailable", () => {
    open({ target: buyTarget, rule: null }, { money: null });
    expect(screen.getByText("Your balance is unavailable.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Arm auto-buy" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
