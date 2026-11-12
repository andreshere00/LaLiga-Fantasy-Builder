import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import type { SquadCard } from "../../api/mappers";
import type { BuilderCandidate, LineupBuildDto } from "../../api/schemas";
import { LineupBuilderTradeDetails } from "./LineupBuilderTradeDetails";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({
  user: { userId: "u1" }, accessToken: "token", markNeedsReauth: vi.fn(),
}) }));
vi.mock("./LeagueProvider", () => ({ useLeague: () => ({
  selected: { id: "l1", team: { id: "t1" } },
}) }));

afterEach(cleanup);

const target = {
  salesDeadline: "2026-11-13T10:00:00Z", clausesDeadline: "2026-11-13T09:00:00Z",
} as LineupBuildDto["target"];

function sellStep(method: "accept_offer" | "immediate_sale", estimate: number) {
  return {
    action: "sell", playerId: "7", playerTeamId: "123", method, estimate,
    settlementAt: "2026-11-12T20:00:00Z", cashAfter: 0, squadValueAfter: 1, squadCountAfter: 1,
    debtLimit: 0, conditions: [], marketValue: 100, offerId: "o1", offerMarketId: "m1",
    bidSuggestion: null, alternatives: [],
  };
}

function renderPlan(
  step: ReturnType<typeof sellStep>, confirmed: string[] = [], squad: SquadCard[] = [],
) {
  const onSaleAction = vi.fn();
  const plan = {
    steps: [step], projectedCash: 0, squadCount: 1, squadValue: 1, reservedSquadSlots: 0,
    retainedPlayerIds: [], tradingPurchases: [], listingSuggestions: [], shortfall: 0,
  } as unknown as BuilderCandidate["tradingPlan"];
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>
    <LineupBuilderTradeDetails plan={plan} target={target} playerName={() => "Bench player"}
      playersById={new Map()} confirmedSales={new Set(confirmed)} onSaleAction={onSaleAction}
      squadByEntryId={new Map(squad.map((card) => [card.id, card]))} />
  </MemoryRouter></QueryClientProvider>);
  return onSaleAction;
}

it("offers to put the player on the market instead of accepting the planned offer", () => {
  const onSaleAction = renderPlan(sellStep("accept_offer", 80));

  fireEvent.click(screen.getByRole("button", { name: "Put on the market" }));

  expect(onSaleAction).toHaveBeenCalledWith({
    kind: "listing", playerId: "7", playerTeamId: "123", name: "Bench player",
    amount: 100, marketValue: 100,
  });
  expect(screen.getByRole("button", { name: /Accept offer/ })).toBeTruthy();
});

it("offers the market as the alternative to an immediate sale at half the value", () => {
  const onSaleAction = renderPlan(sellStep("immediate_sale", 50));

  expect(screen.getByRole("button", { name: /Sell now/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Put on the market" }));

  expect(onSaleAction).toHaveBeenCalledWith(expect.objectContaining({ kind: "listing", amount: 100 }));
});

it("keeps the planned sale available once the player has been put on the market", () => {
  renderPlan(sellStep("accept_offer", 80), ["listing:7"]);

  expect(screen.queryByRole("button", { name: "Put on the market" })).toBeNull();
  expect(screen.getByRole("button", { name: /Accept offer/ })).toBeTruthy();
  expect(screen.getByText(/Listed on the market/)).toBeTruthy();
});

it("shows market options instead of listing a player that is already on the market", () => {
  const listed = { id: "123", name: "Bench player", marketValue: 100, onMarket: true,
    listingId: "m9", salePrice: 120 } as SquadCard;
  const onSaleAction = renderPlan(sellStep("accept_offer", 80), [], [listed]);

  expect(screen.queryByRole("button", { name: "Put on the market" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Market options/ }));

  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(onSaleAction).not.toHaveBeenCalled();
});
