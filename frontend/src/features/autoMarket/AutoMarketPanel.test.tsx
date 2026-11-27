// ---- Mocks, fixtures & helpers ---- //
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoRule } from "../../api/autoMarket";
import { ApiError, NeedsReauthError } from "../../api/errors";
import type { SquadCard } from "../../api/mappers";
import { i18n } from "../../i18n";
import { notify, notifyEvent } from "../../components/ui/Notifications";
import { AutoMarketPanel } from "./AutoMarketPanel";
import { AutoMarketProvider, ruleErrorMessage } from "./AutoMarketProvider";
import { resetAutoMarketNew } from "./useNewFlag";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { userId: "u1" }, accessToken: "token", status: "ready" }),
}));
vi.mock("../scouting/ScoutingProvider", () => ({ useFavoritePlayerIds: () => new Set(["9", "55"]) }));
vi.mock("../lineup/LeagueProvider", () => ({ useLeague: () => ({ selected: { id: "lg", team: { id: "t" } } }) }));
vi.mock("../../components/ui/Notifications", () => ({ notify: vi.fn(), notifyEvent: vi.fn() }));

const rule = (changes: Partial<AutoRule> = {}): AutoRule => ({
  id: 1, leagueId: "lg", side: "sell", target: "market", playerId: "7", playerTeamId: "s7", playerName: "Pedri",
  triggerKind: "relative", triggerPercent: 5, triggerAmount: null, baselineValue: 100_000_000,
  thresholdAmount: 105_000_000, priceMode: "threshold", bidAmount: null, maxSpend: null, state: "armed",
  armedAt: "2026-11-24T10:00:00Z", expiresAt: null, listedPrice: null, acceptFloor: null, listedAt: null,
  lastExecution: null, ...changes,
});
const squad = (changes: Partial<SquadCard> = {}): SquadCard => ({
  id: "s9", masterPlayerId: "9", name: "Ferran", captain: false, positionId: 4, photoUrl: null, teamBadgeUrl: null,
  marketValue: 60_000_000, onMarket: false, listingId: null, salePrice: null, ...changes,
});

let rules: AutoRule[];
let status = "active";
let calls: { method: string; url: string; body: unknown }[];
beforeEach(() => {
  resetAutoMarketNew();
  rules = [];
  status = "active";
  calls = [];
  vi.mocked(notify).mockClear();
  vi.mocked(notifyEvent).mockClear();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "GET" && url === "/api/players") {
      return new Response(JSON.stringify([{ id: "55", nickname: "Lamine", marketValue: 90_000_000 }]), { status: 200 });
    }
    if (method === "GET") {
      return new Response(JSON.stringify({ rules, status, checkedAt: null }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: method === "POST" ? 201 : 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); void i18n.changeLanguage("en"); });

function mount(cards: SquadCard[] = [squad()]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <AutoMarketProvider money={200_000_000}><AutoMarketPanel squad={cards} /></AutoMarketProvider>
    </QueryClientProvider>,
  );
  return { client, ...view };
}
const openPanel = async (count = 0) => {
  fireEvent.click(await screen.findByRole("button", { name: `Auto market, ${count} active` }));
  return screen.findByRole("dialog");
};

// ---- Happy path ---- //
describe("AutoMarketPanel", () => {
  it("AutoMarketPanel_arms_auto_sell_for_favorites_in_the_squad_at_their_market_value", async () => {
    mount([squad(), squad({ id: "s8", masterPlayerId: "8", name: "Gavi" })]);
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Auto-sell favorites… (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Arm 1 auto-sells" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("1 rules armed. Each will run once."));
    expect(calls.filter((call) => call.method === "POST").map((call) => call.body)).toEqual([{
      side: "sell", target: "market", playerId: "9", playerTeamId: "s9", triggerKind: "absolute",
      triggerAmount: 60_000_000, priceMode: "market_value", listNow: true,
    }]);
  });

  it("AutoMarketPanel_arms_auto_buy_for_favorites_not_in_the_squad_at_an_amount", async () => {
    mount();
    await openPanel();
    const buy = await screen.findByRole("button", { name: "Auto-buy favorites… (1)" });
    fireEvent.click(buy);
    fireEvent.click(await screen.findByRole("button", { name: "At an amount" }));
    fireEvent.change(screen.getByLabelText("Amount for each player (€)"), { target: { value: "80.000.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Arm 1 auto-buys" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("1 rules armed. Each will run once."));
    expect(calls.filter((call) => call.method === "POST").map((call) => call.body)).toEqual([{
      side: "buy", target: "market", playerId: "55", triggerKind: "absolute", triggerAmount: 80_000_000,
      priceMode: "threshold", maxSpend: 80_000_000,
    }]);
  });

  it("AutoMarketPanel_flags_auto_market_as_new_until_it_is_opened_once", async () => {
    mount();
    const trigger = await screen.findByRole("button", { name: "Auto market, 0 active" });
    expect(trigger.textContent).toContain("New!");
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    expect(trigger.textContent).not.toContain("New!");
  });

  it("AutoMarketPanel_groups_live_rules_by_side_and_keeps_finished_ones_in_history", async () => {
    rules = [
      rule(),
      rule({ id: 2, side: "buy", target: "clause", playerName: "Gavi", maxSpend: 95_000_000, state: "listed", acceptFloor: 1 }),
      rule({ id: 3, playerName: "Nico", state: "failed", lastExecution: {
        id: 1, ruleId: 3, action: "skip", amount: null, outcome: "failed", reason: "left_squad", createdAt: "2026-11-24T11:00:00Z",
      } }),
    ];
    mount();
    const panel = await (async () => { await waitFor(() => expect(calls.length).toBeGreaterThan(0)); return openPanel(2); })();
    expect(within(panel).getByRole("heading", { name: "Selling" })).toBeTruthy();
    expect(within(panel).getByRole("heading", { name: "Buying" })).toBeTruthy();
    expect(within(panel).getByRole("heading", { name: "History" })).toBeTruthy();
    expect(within(panel).getByText("The player left your squad.")).toBeTruthy();
    expect(within(panel).getByText("Failed")).toBeTruthy();
    expect(within(panel).getByText(/Spends at most 95,000,000 €/)).toBeTruthy();
  });

  it("AutoMarketPanel_cancel_sends_one_authenticated_delete_and_confirms", async () => {
    rules = [rule({ id: 5 })];
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Auto market, 1 active" })).toBeTruthy());
    await openPanel(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel rule for Pedri" }));
    expect(calls.filter((call) => call.method === "DELETE")).toEqual([]);
    const confirmation = screen.getByRole("group", { name: "Confirm cancellation" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel rule" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Rule cancelled. Nothing will be bought or sold for it."));
    const deletes = calls.filter((call) => call.method === "DELETE");
    expect(deletes).toEqual([{ method: "DELETE", url: "/api/auto-market/leagues/lg/rules/5", body: undefined }]);
  });

  it("AutoMarketPanel_set_up_auto_sell_opens_the_dialog_and_arms_the_chosen_squad_entry", async () => {
    mount([squad({ photoUrl: "/ferran.png", teamBadgeUrl: "/badge.png", totalPoints: 88 }),
      squad({ id: "s10", masterPlayerId: "10", name: "OnMarket", onMarket: true })]);
    await openPanel();
    const group = screen.getByRole("radiogroup", { name: "Sell one of my players automatically" });
    const options = within(group).getAllByRole("radio");
    expect(options).toHaveLength(2);
    expect(group.textContent).toContain("OnMarket");
    expect(group.textContent).toContain("On the market");
    expect(group.textContent).toContain("Ferran");
    expect(group.textContent).toContain("FSYP 88");
    expect(group.textContent).toContain("60,000,000 €");
    expect(group.querySelectorAll("img")).toHaveLength(2);
    expect(group.textContent?.match(/On the market/g)).toHaveLength(1);
    const setUp = screen.getByRole("button", { name: "Set up auto-sell" }) as HTMLButtonElement;
    expect(setUp.disabled).toBe(true);
    fireEvent.click(options[0]);
    fireEvent.click(setUp);
    fireEvent.click(await screen.findByRole("button", { name: "Arm auto-sell" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Auto-sell armed. It will run once."));
    expect(calls.find((call) => call.method === "POST")).toEqual({
      method: "POST", url: "/api/auto-market/leagues/lg/rules",
      body: { side: "sell", target: "market", playerId: "9", playerTeamId: "s9",
        triggerKind: "relative", triggerPercent: 5, priceMode: "threshold" },
    });
  });

  it("AutoMarketPanel_list_all_arms_one_list_only_rule_per_player_missing_from_the_market_and_without_a_live_sell_rule", async () => {
    rules = [rule({ playerId: "7" })];
    mount([squad(), squad({ id: "s8", masterPlayerId: "8", name: "Gavi" }), squad({ id: "s7", masterPlayerId: "7", name: "Pedri" }),
      squad({ id: "s10", masterPlayerId: "10", name: "OnMarket", onMarket: true })]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Auto market, 1 active" })).toBeTruthy());
    await openPanel(1);
    fireEvent.click(screen.getByRole("button", { name: "List all my players…" }));
    expect(await screen.findByText(/Nothing is sold automatically/)).toBeTruthy();
    expect(screen.getByText("2 players to put on the market. 1 already on it are left as they are.")).toBeTruthy();
    const listed = screen.getByRole("region", { name: "Players to put on the market" });
    expect(within(listed).getAllByRole("listitem").map((item) => item.firstChild?.textContent))
      .toEqual(["Ferran", "Gavi"]);
    expect(within(listed).queryByText("Pedri")).toBeNull();
    expect(within(listed).queryByText("OnMarket")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "List 2 players" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("2 rules armed. Each will run once."));
    const bodies = calls.filter((call) => call.method === "POST").map((call) => call.body);
    expect(bodies).toEqual(["9", "8"].map((id) => ({
      side: "sell", target: "market", playerId: id, playerTeamId: `s${id}`,
      triggerKind: "none", priceMode: "market_value",
    })));
  });

  it("AutoMarketPanel_list_all_can_sell_every_player_to_an_offer_that_reaches_a_general_gain", async () => {
    mount([squad(), squad({ id: "s8", masterPlayerId: "8", name: "Gavi" })]);
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "List all my players…" }));
    fireEvent.click(await screen.findByRole("button", { name: "List and sell at a gain" }));
    fireEvent.change(screen.getByLabelText("Percentage (%)"), { target: { value: "7,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Arm 2 auto-sells" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("2 rules armed. Each will run once."));
    expect(calls.filter((call) => call.method === "POST").map((call) => call.body)).toEqual(["9", "8"].map((id) => ({
      side: "sell", target: "market", playerId: id, playerTeamId: `s${id}`,
      triggerKind: "relative", triggerPercent: 7.5, priceMode: "threshold", listNow: true,
    })));
  });

  it("AutoMarketPanel_describes_list_only_and_list_now_rules_without_a_misleading_trigger", async () => {
    rules = [
      rule({ id: 1, triggerKind: "none", triggerPercent: null, priceMode: "market_value", listNow: true }),
      rule({ id: 2, playerId: "8", playerName: "Gavi", listNow: true }),
    ];
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Auto market, 2 active" })).toBeTruthy());
    await openPanel(2);
    expect(screen.getByText("Lists the player at their market value. Nothing is sold automatically.")).toBeTruthy();
    expect(screen.getByText(/Lists the player now and accepts an offer of at least/)).toBeTruthy();
  });

  it("AutoMarketPanel_search_finds_any_player_and_arms_a_buy_rule_that_waits_for_the_market", async () => {
    mount();
    await openPanel();
    fireEvent.change(screen.getByLabelText("Buy any player automatically"), { target: { value: "lam" } });
    fireEvent.click(await screen.findByRole("button", { name: /Lamine/ }));
    expect(await screen.findByText(/does not have to be on the market now/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Arm auto-buy" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Auto-buy armed. It will run once."));
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({
      side: "buy", target: "market", playerId: "55", triggerKind: "absolute", triggerAmount: 90_000_000,
      priceMode: "threshold", maxSpend: 90_000_000,
    });
  });

  it("AutoMarketPanel_announces_a_rule_that_acted_after_the_first_load", async () => {
    rules = [rule()];
    const { client } = mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Auto market, 1 active" })).toBeTruthy());
    expect(notifyEvent).not.toHaveBeenCalled();
    rules = [rule({ state: "listed" })];
    await act(() => client.invalidateQueries());
    await waitFor(() => expect(notifyEvent).toHaveBeenCalledWith(
      "auto-market:u1:1:listed", "Pedri was listed by your auto-sell rule."));
    rules = [rule({ state: "failed" })];
    await act(() => client.invalidateQueries());
    await waitFor(() => expect(notify).toHaveBeenCalledWith("The auto rule for Pedri failed. Check your market.", "error"));
  });

  it("AutoMarketPanel_refreshes_the_league_market_and_squad_after_the_worker_lists_a_player", async () => {
    rules = [rule({ triggerKind: "none", priceMode: "market_value" })];
    const { client } = mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Auto market, 1 active" })).toBeTruthy());
    const views = [["market", "lg"], ["team", "lg", "t"], ["team-money", "lg", "t"], ["market-offers", "lg", "s7"]];
    for (const view of views) client.setQueryData(view, { cached: true });
    client.setQueryData(["market", "other"], { cached: true });
    rules = [rule({ triggerKind: "none", priceMode: "market_value", state: "executed" })];
    await act(() => client.invalidateQueries({ queryKey: ["auto-market"] }));
    await waitFor(() => expect(notifyEvent).toHaveBeenCalledWith("auto-market:u1:1:executed", "Auto-sell finished for Pedri."));
    for (const view of views) expect(client.getQueryState(view)?.isInvalidated).toBe(true);
    expect(client.getQueryState(["market", "other"])?.isInvalidated).toBe(false);
  });

  it("AutoMarketPanel_keeps_the_market_cached_when_a_rule_fails_without_a_write", async () => {
    rules = [rule()];
    const { client } = mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Auto market, 1 active" })).toBeTruthy());
    client.setQueryData(["market", "lg"], { cached: true });
    rules = [rule({ state: "failed" })];
    await act(() => client.invalidateQueries({ queryKey: ["auto-market"] }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("The auto rule for Pedri failed. Check your market.", "error"));
    expect(client.getQueryState(["market", "lg"])?.isInvalidated).toBe(false);
  });

  it("AutoMarketPanel_stays_silent_for_rules_already_finished_on_first_load_or_new_to_the_list", async () => {
    rules = [rule({ state: "failed" }), rule({ id: 2, state: "executed", playerName: "Done" })];
    const { client } = mount();
    await openPanel();
    // The first load is only a baseline: finished rules do not announce themselves.
    expect(await screen.findByRole("heading", { name: "Done" })).toBeTruthy();
    expect(notifyEvent).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    rules = [...rules, rule({ id: 3, state: "executed", playerName: "New" })];
    await act(() => client.invalidateQueries());
    expect(await screen.findByRole("heading", { name: "New" })).toBeTruthy();
    expect(notifyEvent).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  // ---- Error paths ---- //
  it.each([
    ["needs_reauth", /paused because your LaLiga session expired/],
    ["not_member", /no longer in the league/],
    ["degraded", /LaLiga was unavailable on the last check/],
  ])("AutoMarketPanel_explains_a_%s_league_instead_of_hiding_the_rules", async (value, message) => {
    status = value;
    mount();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    await openPanel();
    await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
  });

  it("AutoMarketPanel_keep_rule_closes_the_confirmation_without_a_request", async () => {
    rules = [rule({ id: 6 })];
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Auto market, 1 active" })).toBeTruthy());
    await openPanel(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel rule for Pedri" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep rule" }));

    expect(screen.queryByRole("group", { name: "Confirm cancellation" })).toBeNull();
    expect(calls.filter((call) => call.method === "DELETE")).toEqual([]);
  });

  it("AutoMarketPanel_an_executing_rule_cannot_be_edited_or_cancelled", async () => {
    rules = [rule({ state: "executing" })];
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Auto market, 1 active" })).toBeTruthy());
    await openPanel(1);
    expect((screen.getByRole("button", { name: "Edit rule for Pedri" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel rule for Pedri" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("The rule is acting now and cannot be changed.")).toBeTruthy();
  });

  it("AutoMarketPanel_explains_unavailable_edit_and_list_all_actions", async () => {
    rules = [rule({ state: "listed" })];
    mount([squad({ onMarket: true })]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Auto market, 1 active" })).toBeTruthy());
    await openPanel(1);
    expect((screen.getByRole("button", { name: "Edit rule for Pedri" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("The player is already listed, so the rule can no longer be edited.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "List all my players…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("All your players are already on the market.")).toBeTruthy();
  });

  it("ruleErrorMessage_maps_failures_to_specific_actions_without_upstream_text", () => {
    expect(ruleErrorMessage(new NeedsReauthError())).toMatch(/Link your account again/);
    expect(ruleErrorMessage(new ApiError(409, "rule_exists"))).toMatch(/already have an active rule/);
    expect(ruleErrorMessage(new ApiError(404, "not_found"))).toMatch(/not available/);
    expect(ruleErrorMessage(new ApiError(422, "invalid_rule"))).toMatch(/rejected/);
    expect(ruleErrorMessage(new ApiError(500, "secret upstream body"))).toBe("The rule could not be saved. Try again.");
  });

  // ---- Edge cases ---- //
  it("AutoMarketPanel_without_a_provider_renders_nothing", () => {
    render(<AutoMarketPanel squad={[]} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("AutoMarketPanel_without_sellable_players_shows_no_player_options", async () => {
    mount([squad({ marketValue: null }), squad({ id: "s2", masterPlayerId: null })]);
    await openPanel();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByText("No active auto-sells.")).toBeTruthy();
    expect(screen.getByText("No active auto-buys.")).toBeTruthy();
  });
});
