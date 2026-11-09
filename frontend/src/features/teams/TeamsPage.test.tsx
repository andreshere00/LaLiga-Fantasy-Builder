import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamsPage } from "./TeamsPage";

const harness = vi.hoisted(() => ({
  dossier: {
    club: { clubId: 4, name: "FC Barcelona", slug: "barcelona" },
    roster: {
      mvps: [
        { playerId: "1", name: "Ana", points: 9, positionId: 4 },
        { playerId: "2", name: "Bea", points: 8, positionId: 3 },
        { playerId: "3", name: "Cid", points: 7, positionId: 2 },
      ],
      players: [
        { playerId: "1", name: "Ana", positionId: 4, points: 9, stats: { goals: 2, minutes: null } },
      ],
      totals: { goals: 2, minutes: null },
      coverage: { players: 1, matchweeks: [12], shortWindow: true },
    },
    injuries: { published: true, items: [] },
    news: null,
    segmentErrors: [{ segment: "news", code: "scraping_unavailable", detail: "scraping unavailable" }],
  },
  refetch: vi.fn(),
}));

vi.mock("../../api/queries", () => ({
  useClubIndexQuery: () => ({
    data: { clubs: [
      { clubId: 20, name: "Villarreal CF", slug: "villarreal" },
      { clubId: 4, name: "FC Barcelona", slug: "barcelona" },
    ] },
    isPending: false,
  }),
  useClubRosterStatsQuery: () => ({
    data: undefined, isPending: false, isError: false, fetchStatus: "idle", refetch: vi.fn(),
  }),
  useClubDossierQuery: (clubId: string | null) => ({
    data: clubId === "4" ? harness.dossier : undefined,
    isPending: false,
    refetch: harness.refetch,
  }),
}));

vi.mock("../lineup/useSquadStats", () => ({
  usePlayerOutlooks: () => ({ profiles: new Map(), isLoading: false, errors: [] }),
}));

vi.mock("../players/radar/usePlayerRadar", () => ({
  usePlayerRadar: () => ({ displayed: { axes: [] } }),
}));

vi.mock("../market/useMarketBoard", () => ({
  useMarketBoard: () => { throw new Error("market board is unused on this fixture"); },
}));

vi.mock("../market/actions/useMarketActions", () => ({
  useMarketActions: () => { throw new Error("market actions are unused on this fixture"); },
}));

vi.mock("../scouting/ScoutingProvider", () => ({
  useScouting: () => { throw new Error("scouting is unused on this fixture"); },
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ status: "ready" }),
}));

function renderTeams(path: string, opponentClubId?: number) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/teams" element={<TeamsPage opponentClubId={opponentClubId ?? null} />} />
        <Route path="/teams/:clubId" element={<TeamsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Teams page", () => {
  beforeEach(() => {
    cleanup();
    harness.refetch.mockClear();
  });

  it("TeamsPage_first_visit_opens_the_first_club_in_the_locale", async () => {
    renderTeams("/teams");
    expect(await screen.findByRole("heading", { name: "FC Barcelona" })).toBeTruthy();
  });

  it("TeamsPage_known_opponent_opens_that_club", async () => {
    renderTeams("/teams", 20);
    const current = (await screen.findAllByRole("link", { name: "Villarreal CF" }))
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(current).toBeTruthy();
  });

  it("TeamsPage_players_and_news_failure_stay_separate", async () => {
    renderTeams("/teams/4");
    expect((await screen.findAllByText("No current injuries were published.")).length).toBeGreaterThan(0);
    expect(document.querySelector(".team-mvp-list")?.textContent).toContain("Ana");
    expect(document.querySelector(".team-mvp-list")?.textContent).toContain("Bea");
    expect(document.querySelector(".team-mvp-list")?.textContent).toContain("Cid");
    expect(screen.getAllByText(/Totals cover a short window/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Retry" }).length).toBeGreaterThan(0);
  });

  it("TeamsPage_section_bar_follows_the_section_being_read", async () => {
    renderTeams("/teams/4");
    await screen.findByRole("heading", { name: "FC Barcelona" });
    const tops: Record<string, number> = {
      "team-players": -600, "team-performance": 80, "team-lineup": 900, "team-news": 1800,
    };
    for (const [id, top] of Object.entries(tops)) {
      const element = document.getElementById(id) as HTMLElement;
      element.getBoundingClientRect = () => ({ top } as DOMRect);
    }
    act(() => { window.dispatchEvent(new Event("scroll")); });
    const bar = screen.getByRole("navigation", { name: "Club sections" });
    const current = bar.querySelector('[aria-current="true"]');
    expect(current?.textContent).toBe("Performance");
  });
});
