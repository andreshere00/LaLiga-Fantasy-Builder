import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MarketRow } from "../model/row";
import { BidDialog } from "./BidDialog";

const row: MarketRow = {
  id: "m", marketId: "m", playerId: "7", playerTeamId: null, name: "Player", positionId: 1,
  photoUrl: null, teamBadgeUrl: null, teamName: null, points: null, form: null, formRecent: [],
  formRecentWeeks: [], averagePoints: null, marketValue: 150, variation: null, variationPercent: null,
  availability: "available", expiresAt: null, seller: "LaLiga", sellerTeamId: null, sellerKind: "laliga",
  buyoutClause: null, clauseUnlockAt: null, isShielded: false, myBid: null, directOffer: false, valueHistory: [],
};

afterEach(cleanup);

it("should confirm a bid that uses the allowed debt from a positive cash balance", () => {
  const confirm = vi.fn();
  render(<BidDialog open row={row} kind="hire" money={100} squadMarketValue={1000}
    initialAmount={null} pending={false} onClose={() => {}} onConfirm={confirm} />);
  const button = screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement;
  const input = screen.getByRole("textbox", { name: "Bid amount" });
  expect(button.disabled).toBe(false);
  expect(screen.getByText(/available cash plus up to 20% of squad value/)).toBeTruthy();
  fireEvent.change(input, { target: { value: "301" } });
  expect(button.disabled).toBe(true);
  fireEvent.change(input, { target: { value: "300" } });
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(confirm).toHaveBeenCalledExactlyOnceWith(300);
});

it("should include the released reservation when modifying a bid across zero cash", () => {
  render(<BidDialog open row={{ ...row, myBid: { id: "bid-1", money: 50 } }} kind="modify"
    money={100} squadMarketValue={1000} initialAmount={150} pending={false}
    onClose={() => {}} onConfirm={() => {}} />);
  const input = screen.getByRole("textbox", { name: "Bid amount" });
  const button = screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement;
  fireEvent.change(input, { target: { value: "350" } });
  expect(button.disabled).toBe(false);
  fireEvent.change(input, { target: { value: "351" } });
  expect(button.disabled).toBe(true);
});
