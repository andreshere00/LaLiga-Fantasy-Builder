import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

vi.mock("../lineup/useSquadStats", () => ({
  usePlayerOutlooks: () => ({
    profiles: new Map([["7", { form: { rating: "good" }, startProbability: { percent: 80 } }]]),
    isLoading: false,
    errors: [],
  }),
}));

vi.mock("./useRecentPoints", () => ({
  useRecentPoints: () => new Map([["7", [{ matchweek: 11, points: 6 }, { matchweek: 12, points: 12 }]]]),
}));

vi.mock("../scouting/ScoutingProvider", () => ({
  useScouting: () => ({ favorites: new Set<string>(), pending: false, toggle }),
}));

const prediction = {
  matchday: 12,
  coach: {
    name: "Manuel Pellegrini",
    rotations: "Algunas rotaciones",
    matchdayPredictability: "Poco previsible",
    seasonPredictabilityPercent: 70,
  },
  starters: [{ name: "Isco", probability: 80, photoUrl: null, position: "Mediocampista" }],
  alternatives: [
    { name: "Mystery", probability: 0, position: "Delantero" },
    { name: "Later", probability: 40, position: "Delantero" },
  ],
  summary: { averageProbability: 70, averageFormArrow: 3, substituteRisk: "2.64 jugs" },
};

function renderLineup() {
  return render(
    <MemoryRouter>
      <TeamLineupSection prediction={prediction} squad={[{ playerId: "7", name: "Isco", points: 55 }]}
        failed={false} returnTo="/teams/5?section=lineup" onRetry={vi.fn()} />
    </MemoryRouter>,
  );
}

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
    expect(screen.getByText(/Matchday 12/)).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.getAllByText("Mystery").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Details unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Field player" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Isco/ }));
    const field = screen.getByRole("link", { name: "Field player" });
    expect(field.getAttribute("href")).toBe("/?focusPlayer=7&team=t1");
    expect(openBid).not.toHaveBeenCalled();
  });

  it("TeamLineupSection_coach_and_labels_are_translated_and_ranked", () => {
    renderLineup();
    expect(screen.getByText("Hard to predict")).toBeTruthy();
    expect(screen.getByText("Some rotations")).toBeTruthy();
    expect(screen.getByText("2.64 players")).toBeTruthy();
    expect(screen.getByText("3 of 5")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Attack/ })).toBeTruthy();
    expect(screen.queryByText(/Poco previsible|jugs|Delantero/)).toBeNull();
  });

  it("TeamLineupSection_pitch_tokens_show_form_and_fsyp_and_open_a_detail_dialog", () => {
    renderLineup();
    const token = screen.getByRole("button", { name: /Isco/ });
    expect(token.textContent).toContain("55");
    expect(token.textContent).toContain("Good");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(token);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Player details" }).getAttribute("href")).toBe("/players/7");
    expect(within(dialog).getByText("12")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Favorite Isco" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("TeamLineupSection_alternative_lines_expand_and_collapse", () => {
    renderLineup();
    expect(screen.getAllByText("Later").length).toBeGreaterThan(0);
    const trigger = screen.getByRole("button", { name: /Attack/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(trigger);
    expect(screen.queryByText("Mystery", { selector: "strong" })).toBeNull();
    expect(screen.getByRole("button", { name: /Attack/ }).textContent).toContain("Later 40%");
  });
});
