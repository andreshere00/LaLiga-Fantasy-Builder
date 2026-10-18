import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import response from "../../../../contracts/lineup-builder-response.json";
import { lineupBuildResponseSchema } from "../../api/schemas";
import { LineupBuilderResults } from "./LineupBuilderResults";

afterEach(cleanup);

function recommendations(ownedCount: number, externalCount: number) {
  const result = lineupBuildResponseSchema.parse(response.payload);
  const template = result.candidates[0];
  result.candidates = (["owned", "external"] as const).flatMap((group) =>
    Array.from({ length: group === "owned" ? ownedCount : externalCount }, (_, index) => ({
      ...template, candidateId: `${group}-${index}`, resourceGroup: group,
      totalLineupScore: (group === "owned" ? 5 : 6) - index / 100,
    })),
  );
  return result;
}

it("should filter a single top-seven list while preserving ranks and the visible candidate action", () => {
  const result = recommendations(4, 4);
  const onApply = vi.fn();
  render(<LineupBuilderResults result={result} canApply={() => true} onApply={onApply} playersById={new Map()} />);
  const filter = screen.getByRole("button", { name: "Squad with external players" });
  expect(screen.getAllByRole("article")).toHaveLength(4);
  expect(screen.getByText("Showing 4 of 7 lineups.")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "1. 4-4-2 · Owned starting XI" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: /Acquisitions required/ })).toBeNull();
  fireEvent.click(filter);
  expect(filter.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.getByText("Showing 3 of 7 lineups.")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "5. 4-4-2 · Acquisitions required" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: /Owned starting XI/ })).toBeNull();
  expect(screen.queryByRole("heading", { name: /^8\./ })).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "Use as draft" })[2]);
  expect(onApply).toHaveBeenCalledWith(result.candidates[6]);
  fireEvent.click(screen.getByRole("button", { name: "Only current squad" }));
  expect(screen.getByRole("heading", { name: "1. 4-4-2 · Owned starting XI" })).toBeTruthy();
});

it("should explain an empty external filter without filling it with weaker proposals", () => {
  render(<LineupBuilderResults result={recommendations(7, 0)} canApply={() => true} onApply={() => {}} playersById={new Map()} />);
  fireEvent.click(screen.getByRole("button", { name: "Squad with external players" }));
  expect(screen.queryByRole("article")).toBeNull();
  expect(screen.getByText("No improving external lineups were found for these settings.")).toBeTruthy();
  expect(screen.getByText("Showing 0 of 7 lineups.")).toBeTruthy();
});

it("should start on external proposals when no current-squad lineup can be built", () => {
  render(<LineupBuilderResults result={recommendations(0, 2)} canApply={() => false} onApply={() => {}} playersById={new Map()} />);
  expect(screen.getByRole("button", { name: "Squad with external players" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getAllByRole("article")).toHaveLength(2);
});

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
