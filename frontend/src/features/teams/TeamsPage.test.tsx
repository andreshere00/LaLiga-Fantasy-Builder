import { render, screen } from "@testing-library/react";
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
  beforeEach(() => harness.refetch.mockClear());

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
});
