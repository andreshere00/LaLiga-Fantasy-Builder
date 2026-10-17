import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import response from "../../../../contracts/lineup-builder-response.json";
import { lineupBuildResponseSchema } from "../../api/schemas";
import { LineupBuilderResults } from "./LineupBuilderResults";

afterEach(cleanup);

it("should explain the previous-round history and omitted standings during a live round", () => {
  const result = lineupBuildResponseSchema.parse(response.payload);
  result.diagnostics = [
    { code: "recent_matches_previous_round", playerId: null },
    { code: "standings_unavailable", playerId: null },
  ];
  render(<LineupBuilderResults result={result} canApply={() => false} onApply={() => {}}
    playersById={new Map()} />);
  expect(screen.getByText(/Recent match analysis uses completed matches from previous rounds/)).toBeTruthy();
  expect(screen.getByText(/Position criteria are omitted/)).toBeTruthy();
});

it("should show only unavailable players and clauses locked through matchday start", () => {
  const result = lineupBuildResponseSchema.parse(response.payload);
  result.diagnostics = [
    { code: "cash_conservative_bid_reserve", playerId: null },
    { code: "market_settlement_after_kickoff", playerId: "market-player" },
    { code: "opponent_protection_expires_too_late", playerId: "opponent-player" },
    { code: "player_unavailable", playerId: "unavailable-player" },
    { code: "opponent_protection_active_at_kickoff", playerId: "locked-player" },
    { code: "no_recent_appearance", playerId: "inactive-player" },
    { code: "opponent_shield_status_unknown", playerId: "unknown-player" },
  ];
  render(<LineupBuilderResults result={result} canApply={() => false} onApply={() => {}}
    playersById={new Map([
      ["market-player", { name: "Market player", photoUrl: null }],
      ["opponent-player", { name: "Opponent player", photoUrl: null }],
      ["unavailable-player", { name: "Unavailable player", photoUrl: null }],
      ["locked-player", { name: "Locked player", photoUrl: null }],
    ])} />);
  expect(screen.getByText("2 source exclusions")).toBeTruthy();
  expect(screen.getByRole("table", { name: "Source exclusions", hidden: true })).toBeTruthy();
  expect(screen.getByRole("rowheader", { name: "Unavailable player", hidden: true })).toBeTruthy();
  expect(screen.getByRole("rowheader", { name: "Locked player", hidden: true })).toBeTruthy();
  expect(screen.getByRole("cell", { name: "The player's release clause is still locked when the target matchday starts.", hidden: true })).toBeTruthy();
  expect(screen.queryByRole("rowheader", { name: "Market player", hidden: true })).toBeNull();
  expect(screen.queryByRole("rowheader", { name: "Opponent player", hidden: true })).toBeNull();
  expect(screen.getByText(/Cash projections use a conservative lower bound/)).toBeTruthy();
  expect(screen.queryByText("3 source exclusions")).toBeNull();
});

it("should hide the exclusions table when only other source diagnostics exist", () => {
  const result = lineupBuildResponseSchema.parse(response.payload);
  result.diagnostics = [{ code: "market_seller_acceptance_required", playerId: "market-player" }];
  render(<LineupBuilderResults result={result} canApply={() => false} onApply={() => {}} playersById={new Map()} />);
  expect(screen.queryByRole("table", { name: "Source exclusions", hidden: true })).toBeNull();
});
