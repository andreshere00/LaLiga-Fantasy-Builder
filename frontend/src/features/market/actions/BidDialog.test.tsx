import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { i18n } from "../../../i18n";
import type { MarketRow } from "../model/row";
import { BidDialog } from "./BidDialog";

const row: MarketRow = {
  id: "m", marketId: "m", playerId: "7", playerTeamId: null, name: "Player", positionId: 1,
  photoUrl: null, teamBadgeUrl: null, teamName: null, points: null, form: null, formRecent: [],
  formRecentWeeks: [], averagePoints: null, marketValue: 150, variation: null, variationPercent: null,
  availability: "available", expiresAt: null, seller: "LaLiga", sellerTeamId: null, sellerKind: "laliga",
  buyoutClause: null, clauseUnlockAt: null, isShielded: false, myBid: null, directOffer: false, valueHistory: [],
};

afterEach(() => { cleanup(); void i18n.changeLanguage("en"); });

it("should confirm a bid that uses the allowed debt from a positive cash balance", () => {
  const confirm = vi.fn();
  render(<BidDialog open row={row} kind="hire" money={100} squadMarketValue={1000}
    initialAmount={null} pending={false} onClose={() => {}} onConfirm={confirm} />);
  const button = screen.getByRole("button", { name: "Place bid" }) as HTMLButtonElement;
  const input = screen.getByRole("textbox", { name: "Bid amount" });
  expect(button.disabled).toBe(false);
  expect(screen.getByText(/available cash plus up to 20% of squad value/)).toBeTruthy();
  fireEvent.change(input, { target: { value: "301" } });
  expect(button.disabled).toBe(true);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const error = screen.getByRole("alert");
  expect(error.textContent).toBe("Enter no more than 300 €.");
  expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
  fireEvent.change(input, { target: { value: "300" } });
  expect(button.disabled).toBe(false);
  expect(input.getAttribute("aria-invalid")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(button);
  expect(confirm).toHaveBeenCalledExactlyOnceWith(300);
});

it("should include the released reservation when modifying a bid across zero cash", () => {
  render(<BidDialog open row={{ ...row, myBid: { id: "bid-1", money: 50 } }} kind="modify"
    money={100} squadMarketValue={1000} initialAmount={150} pending={false}
    onClose={() => {}} onConfirm={() => {}} />);
  const input = screen.getByRole("textbox", { name: "Bid amount" });
  const button = screen.getByRole("button", { name: "Update bid" }) as HTMLButtonElement;
  fireEvent.change(input, { target: { value: "350" } });
  expect(button.disabled).toBe(false);
  fireEvent.change(input, { target: { value: "351" } });
  expect(button.disabled).toBe(true);
});

it.each([
  { money: 100, squadMarketValue: 1000, hint: "como máximo 300 € (saldo disponible más hasta el 20% del valor de la plantilla)" },
  { money: 200, squadMarketValue: null, hint: "como máximo 200 € (saldo disponible)" },
  { money: null, squadMarketValue: null, hint: "dentro de tu límite de puja" },
])("localizes bid guidance after switching language without resetting the draft: $hint", async ({ money, squadMarketValue, hint }) => {
  render(<BidDialog open row={row} kind="hire" money={money} squadMarketValue={squadMarketValue}
    initialAmount={null} pending={false} onClose={() => {}} onConfirm={() => {}} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Bid amount" }), { target: { value: "175" } });
  await act(() => i18n.changeLanguage("es"));
  const input = screen.getByRole("textbox", { name: "Importe de la puja" }) as HTMLInputElement;
  expect(input.value).toBe("175");
  const description = document.getElementById(input.getAttribute("aria-describedby")!.split(" ")[0]);
  expect(description?.textContent).toContain(hint);
  expect(description?.textContent).not.toMatch(/available cash|squad value|bidding limit/);
});

it("localizes the seller acceptance requirement for a direct offer", () => {
  void i18n.changeLanguage("es");
  render(<BidDialog open row={{ ...row, directOffer: true, sellerKind: "opponent", playerTeamId: "s7" }}
    kind="purchase" money={200} squadMarketValue={null} initialAmount={null} pending={false}
    onClose={() => {}} onConfirm={() => {}} />);
  expect(screen.getByText("El propietario debe aceptar tu oferta para que el jugador pase a tu plantilla.", { exact: false })).toBeTruthy();
});

it("should start a new bid from the suggested amount and keep it editable", () => {
  const confirm = vi.fn();
  render(<BidDialog open row={row} kind="hire" money={1000} squadMarketValue={1000}
    initialAmount={180} pending={false} onClose={() => {}} onConfirm={confirm} />);
  const input = screen.getByRole("textbox", { name: "Bid amount" }) as HTMLInputElement;
  expect(input.value).toBe("180");
  fireEvent.change(input, { target: { value: "160" } });
  fireEvent.click(screen.getByRole("button", { name: "Place bid" }));
  expect(confirm).toHaveBeenCalledExactlyOnceWith(160);
});
