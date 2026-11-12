import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getJson, postJson } from "../../api/client";
import { LineupBuilderSaleActions, resolvePlannedOffer, type BuilderSaleAction } from "./LineupBuilderSaleActions";

vi.mock("../../api/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../api/client")>(), getJson: vi.fn(), postJson: vi.fn(),
}));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({
  user: { userId: "u1" }, accessToken: "token", markNeedsReauth: vi.fn(),
}) }));
vi.mock("./LeagueProvider", () => ({ useLeague: () => ({
  selected: { id: "l1", team: { id: "t1" } },
}) }));

beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);

const accept: Extract<BuilderSaleAction, { kind: "accept_offer" }> = {
  kind: "accept_offer", playerId: "7", playerTeamId: "123", name: "Bench player",
  amount: 80, marketValue: 100, offerId: "o1", marketId: "m1",
};

function renderAction(action: BuilderSaleAction, onDone = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <LineupBuilderSaleActions action={action} squad={[]} onClose={vi.fn()} onDone={onDone} />
  </QueryClientProvider>);
  return { client, onDone };
}

it("resolves the planned offer only while it is pending at the same amount or higher", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  const offer = { id: "o1", marketId: "m1", money: 80, status: "pending", expirationDate: "2026-11-13T00:00:00Z" };
  expect(resolvePlannedOffer({ offers: [offer] }, accept, null, now)).toEqual({ id: "o1", marketId: "m1", money: 80 });
  expect(resolvePlannedOffer({ offers: [{ ...offer, money: 70 }] }, accept, null, now)).toBeNull();
  expect(resolvePlannedOffer({ offers: [{ ...offer, status: "accepted" }] }, accept, null, now)).toBeNull();
  expect(resolvePlannedOffer({ offers: [{ ...offer, expirationDate: "2026-11-12T11:00:00Z" }] }, accept, null, now)).toBeNull();
});

it("re-reads the offer, warns when it is below market value and accepts after one confirmation", async () => {
  vi.mocked(getJson).mockResolvedValue({ offers: [{ id: "o1", marketId: "m1", money: 80, status: "pending" }] });
  vi.mocked(postJson).mockResolvedValue({});
  const { client, onDone } = renderAction(accept);
  expect(screen.getByText(/below the player's market value/)).toBeTruthy();
  expect(postJson).not.toHaveBeenCalled();

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Check offer" })); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Accept offer" })); });

  expect(postJson).toHaveBeenCalledWith("/api/market/leagues/l1/m1/offers/o1/accept", "token", { offerMoney: 80 });
  expect(onDone).toHaveBeenCalledWith(accept);
  client.clear();
});

it("warns that an immediate sale pays half the market value and cannot be undone", async () => {
  vi.mocked(postJson).mockResolvedValue({});
  const { client, onDone } = renderAction({
    kind: "immediate_sale", playerId: "7", playerTeamId: "123", name: "Bench player", amount: 50, marketValue: 100,
  });
  expect(screen.getByText(/half the current market value/)).toBeTruthy();
  expect(screen.getByText(/cannot be undone/)).toBeTruthy();
  expect(postJson).not.toHaveBeenCalled();

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Sell now" })); });

  expect(vi.mocked(postJson).mock.calls[0][0]).toBe("/api/market/leagues/l1/immediate-sales");
  expect(onDone).toHaveBeenCalled();
  client.clear();
});

it("prefills the listing price and rejects a price below market value", () => {
  const { client } = renderAction({
    kind: "listing", playerId: "7", playerTeamId: "123", name: "Bench player", amount: 100, marketValue: 100,
  });
  const price = screen.getByRole("textbox", { name: "Sale price" }) as HTMLInputElement;
  expect(price.value).toBe("100");
  fireEvent.change(price, { target: { value: "99" } });
  expect((screen.getByRole("button", { name: "List for sale" }) as HTMLButtonElement).disabled).toBe(true);
  client.clear();
});
