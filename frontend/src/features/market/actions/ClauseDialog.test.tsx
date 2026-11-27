// ---- Mocks, fixtures & helpers ---- //
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { MarketRow } from "../model/row";
import { ClauseDialog } from "./ClauseDialog";

const row = { id: "m", name: "Player" } as MarketRow;

function facts() {
  return [...document.querySelectorAll(".market-dialog-facts > div")].map((fact) => [
    fact.querySelector("dt")?.textContent, fact.querySelector("dd")?.textContent, fact.getAttribute("data-tone"),
  ]);
}

afterEach(cleanup);

// ---- Happy path ---- //
it("clauseDialog_withBalance_showsBalanceBeforeAndAfterPaying", () => {
  render(<ClauseDialog open row={row} amount={300} money={1000} pending={false}
    onClose={() => {}} onConfirm={() => {}} />);

  expect(screen.getByRole("dialog").textContent).toContain("The payment can't be undone.");
  expect(facts()).toEqual([
    ["Release clause", "300 €", null],
    ["Balance", "1,000 €", null],
    ["Balance after payment", "700 €", null],
  ]);
});

// ---- Edge cases ---- //
it("clauseDialog_clauseAboveBalance_flagsNegativeBalanceAfter", () => {
  render(<ClauseDialog open row={row} amount={1500} money={1000} pending={false}
    onClose={() => {}} onConfirm={() => {}} />);

  expect(facts()[2]).toEqual(["Balance after payment", "-500 €", "failure"]);
});

it("clauseDialog_unknownBalance_showsPlaceholders", () => {
  render(<ClauseDialog open row={row} amount={300} money={null} pending={false}
    onClose={() => {}} onConfirm={() => {}} />);

  expect(facts()[1][1]).toBe("—");
  expect(facts()[2][1]).toBe("—");
});
