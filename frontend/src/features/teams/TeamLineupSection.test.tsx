import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamLineupSection } from "./TeamLineupSection";

const openBid = vi.hoisted(() => vi.fn());
const toggle = vi.hoisted(() => vi.fn());

vi.mock("../../api/queries", () => ({
  usePlayersCatalogQuery: () => ({
    data: [{ id: "7", name: "Isco", nickname: "Isco" }],
    isLoading: false,
  }),
}));

vi.mock("../market/useMarketBoard", () => ({
  useMarketBoard: () => ({
    rows: [{
      playerId: "7",
      name: "Isco",
      sellerKind: "opponent",
      myBid: { id: "bid-1", money: 1_000_000 },
      expiresAt: null,
      bidActionsAvailable: true,
      positionId: 4,
      marketId: "m1",
      playerTeamId: "pt1",
    }],
    ownSquadCards: [{ masterPlayerId: "7" }],
    money: 1_000_000,
    callerTeamId: "t1",
    squadPlayerCount: 18,
    activeBidCount: 1,
    squadMarketValue: 20_000_000,
  }),
}));

vi.mock("../market/actions/useMarketActions", () => ({
  useMarketActions: () => ({
    pendingBid: null,
    pendingClause: null,
    pendingWithdraw: null,
    actionPending: false,
    openBid,
  }),
}));

vi.mock("../market/actions/MarketActionDialogs", () => ({
  MarketActionDialogs: () => null,
}));

vi.mock("../scouting/ScoutingProvider", () => ({
  useScouting: () => ({ favorites: new Set<string>(), pending: false, toggle }),
}));

const prediction = {
  matchday: 12,
  coach: {
    name: "Manuel Pellegrini",
    rotations: "Algunas rotaciones",
    seasonPredictabilityPercent: 70,
  },
  starters: [{ name: "Isco", probability: 80, photoUrl: null, position: "Midfielder" }],
  alternatives: [
    { name: "Mystery", probability: 0, position: "Forward" },
    { name: "Later", probability: 40, position: "Forward" },
  ],
  summary: { averageProbability: 70, averageFormArrow: null, substituteRisk: null },
};

describe("TeamLineupSection", () => {
  beforeEach(() => {
    cleanup();
    openBid.mockClear();
    toggle.mockClear();
  });

  it("TeamLineupSection_published_xi_keeps_zero_and_limits_actions", () => {
    render(
      <MemoryRouter>
        <TeamLineupSection
          prediction={prediction}
          failed={false}
          returnTo="/teams/5?section=lineup"
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.getAllByText("Mystery").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fantasy actions are unavailable for this player.").length)
      .toBeGreaterThan(0);
    const field = screen.getByRole("link", { name: "Field player" });
    expect(field.getAttribute("href")).toBe("/?focusPlayer=7&team=t1");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(openBid).not.toHaveBeenCalled();
  });
});
