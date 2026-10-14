import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import response from "../../../../contracts/lineup-builder-response.json";
import { lineupBuildResponseSchema } from "../../api/schemas";
import { LineupBuilderResults } from "./LineupBuilderResults";

afterEach(cleanup);

it("should explain real exclusion reasons and keep bid reserves outside the exclusion count", () => {
  const result = lineupBuildResponseSchema.parse(response.payload);
  result.diagnostics = [
    { code: "cash_conservative_bid_reserve", playerId: null },
    { code: "market_settlement_after_kickoff", playerId: "market-player" },
    { code: "opponent_protection_expires_too_late", playerId: "opponent-player" },
  ];
  render(<LineupBuilderResults result={result} canApply={() => false} onApply={() => {}}
    playersById={new Map([
      ["market-player", { name: "Market player", photoUrl: null }],
      ["opponent-player", { name: "Opponent player", photoUrl: null }],
    ])} />);
  expect(screen.getByText("2 source exclusions")).toBeTruthy();
  expect(screen.getByRole("table", { name: "Source exclusions", hidden: true })).toBeTruthy();
  expect(screen.getByRole("rowheader", { name: "Market player", hidden: true })).toBeTruthy();
  expect(screen.getByRole("cell", { name: "The auction settles at or after the target round starts.", hidden: true })).toBeTruthy();
  expect(screen.getByRole("rowheader", { name: "Opponent player", hidden: true })).toBeTruthy();
  expect(screen.getByRole("cell", { name: "Protection does not expire at least 48 hours before the target round starts.", hidden: true })).toBeTruthy();
  expect(screen.getByText(/Cash projections use a conservative lower bound/)).toBeTruthy();
  expect(screen.queryByText("3 source exclusions")).toBeNull();
});
