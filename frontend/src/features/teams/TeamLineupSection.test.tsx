import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamLineupSection } from "./TeamLineupSection";

const openBid = vi.hoisted(() => vi.fn());
const toggle = vi.hoisted(() => vi.fn());

vi.mock("../../api/queries", () => ({
  usePlayersCatalogQuery: () => ({
    data: [{ id: "7", name: "Isco", nickname: "Isco", teamId: 5 }],
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
    profiles: new Map([
      ["7", { form: { rating: "good" }, startProbability: { percent: 80 } }],
      ["8", { startProbability: { percent: 40 }, hierarchy: { label: "Rotación", rank: 4 } }],
    ]),
    isLoading: false,
    errors: [],
  }),
}));

vi.mock("./useRecentPoints", () => ({
  useRecentPoints: () => new Map([["7", [{ matchweek: 11, points: 6 }, { matchweek: 12, points: 12 }]]]),
  useRecentMatches: () => ({
    loading: false,
    failed: false,
    matches: [{
      matchweek: 12, opponent: "Getafe", isHome: true, score: "2-1", result: "W", points: 12,
      stats: [{ key: "goals", count: 1, points: 10 }, { key: "minutesPlayed", count: 90, points: 2 }],
    }],
  }),
}));

vi.mock("../players/radar/usePlayerRadar", () => ({
  usePlayerRadar: () => ({
    section: { current: null },
    query: { isPending: false },
    displayed: null,
  }),
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
          clubId="5"
          failed={false}
          returnTo="/teams/5?section=lineup"
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Matchday 12/)).toBeTruthy();
    expect(screen.queryByText("Mystery")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Attack/ }));
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
    expect(within(dialog).getByText("Radar is not published for this player.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Last 5 matches in detail" }));
    expect(within(dialog).getByText(/Getafe/)).toBeTruthy();
    expect(within(dialog).getByText("Goals")).toBeTruthy();
  });

  it("TeamLineupSection_dialog_lists_market_options_as_buttons", () => {
    renderLineup();
    fireEvent.click(screen.getByRole("button", { name: /Isco/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Market options")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Cancel bid" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Modify bid" }));
    expect(openBid).toHaveBeenCalled();
  });

  it("TeamLineupSection_alternative_lines_expand_and_collapse", () => {
    renderLineup();
    const trigger = screen.getByRole("button", { name: /Attack/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("Later 40%");
    expect(screen.queryByText("Mystery", { selector: "strong" })).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: /Attack/ }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Mystery", { selector: "strong" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Attack/ }));
    expect(screen.queryByText("Mystery", { selector: "strong" })).toBeNull();
  });

  it("TeamLineupSection_alternative_shows_the_translated_hierarchy_when_published", () => {
    render(
      <MemoryRouter>
        <TeamLineupSection prediction={prediction}
          squad={[{ playerId: "7", name: "Isco", points: 55 }, { playerId: "8", name: "Later", points: 3 }]}
          failed={false} returnTo="/teams/5?section=lineup" onRetry={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Attack/ }));
    const rows = [...document.querySelectorAll(".team-alternatives .team-xi-player")];
    const later = rows.find((row) => row.textContent?.includes("Later"));
    expect(later?.querySelector(".team-hierarchy")?.textContent).toContain("Rotation");
    // A substitute without a matching profile role shows no badge at all.
    const mystery = rows.find((row) => row.textContent?.includes("Mystery"));
    expect(mystery?.querySelector(".team-hierarchy")).toBeNull();
  });
});
