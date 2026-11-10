import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors";
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
  loading: false,
  dossierError: null as Error | null,
  reauth: vi.fn(),
}));

vi.mock("./useRecentPoints", () => ({ useRecentPoints: () => new Map() }));

vi.mock("../../api/queries", () => ({
  useReauthOnError: (errors: unknown[]) => harness.reauth(errors),
  useClubIndexQuery: () => ({
    data: { clubs: [
      { clubId: 20, name: "Villarreal CF", shortName: "VIL", badgeUrl: "https://x.test/vil.png", slug: "villarreal" },
      { clubId: 4, name: "FC Barcelona", slug: "barcelona" },
    ] },
    isPending: false,
  }),
  usePlayersCatalogQuery: () => ({ data: undefined }),
  useCompetitionStandingsQuery: () => ({
    data: { rows: [{ position: 3, points: 45, team: { id: 4, name: "FC Barcelona" } }] },
  }),
  useClubRosterStatsQuery: () => ({
    data: undefined, isPending: false, isError: false, fetchStatus: "idle", refetch: vi.fn(),
  }),
  useClubDossierQuery: (clubId: string | null) => ({
    data: clubId === "4" && !harness.loading && !harness.dossierError ? harness.dossier : undefined,
    isPending: harness.loading,
    isLoading: harness.loading,
    isError: harness.dossierError != null,
    error: harness.dossierError,
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
    harness.loading = false;
    harness.dossierError = null;
    harness.reauth.mockClear();
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

  it("TeamsPage_loading_dossier_shows_a_spinner_and_a_skeleton_for_each_section", async () => {
    harness.loading = true;
    renderTeams("/teams/4");
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Loading the club dossier.");
    expect(status.querySelector(".fb-pulse-ring")).toBeTruthy();
    for (const id of ["team-performance", "team-players", "team-lineup", "team-news"]) {
      const section = document.getElementById(id) as HTMLElement;
      expect(section.getAttribute("aria-busy")).toBe("true");
      expect(section.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    }
    expect(screen.getByRole("heading", { name: "Players" })).toBeTruthy();
  });

  it("TeamsPage_failed_dossier_announces_the_error_and_retries", async () => {
    harness.dossierError = new Error("boom");
    renderTeams("/teams/4");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The club could not be loaded.");
    await act(async () => { screen.getByRole("button", { name: "Retry" }).click(); });
    expect(harness.refetch).toHaveBeenCalledTimes(1);
    expect(harness.reauth).toHaveBeenCalledWith([undefined, harness.dossierError]);
  });

  it("TeamsPage_unknown_club_says_it_was_not_found", async () => {
    harness.dossierError = new ApiError(404, "not_found");
    renderTeams("/teams/4");
    expect((await screen.findByRole("alert")).textContent).toContain("This club could not be found.");
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
      "team-performance": -600, "team-players": 80, "team-lineup": 900, "team-news": 1800,
    };
    for (const [id, top] of Object.entries(tops)) {
      const element = document.getElementById(id) as HTMLElement;
      element.getBoundingClientRect = () => ({ top } as DOMRect);
    }
    act(() => { window.dispatchEvent(new Event("scroll")); });
    const bar = screen.getByRole("navigation", { name: "Club sections" });
    const current = bar.querySelector('[aria-current="true"]');
    expect(current?.textContent).toBe("Players");
  });

  it("TeamsPage_navigation_gives_each_section_an_icon_and_each_club_a_short_name", async () => {
    renderTeams("/teams/4");
    await screen.findByRole("heading", { name: "FC Barcelona" });
    const tabs = screen.getByRole("navigation", { name: "Club sections" }).querySelectorAll("a");
    expect(tabs).toHaveLength(4);
    for (const tab of tabs) expect(tab.querySelector("svg.team-section-icon[aria-hidden='true']")).toBeTruthy();
    const picker = screen.getByRole("navigation", { name: "Choose a club" });
    const villarreal = picker.querySelector("a[title='Villarreal CF']") as HTMLElement;
    expect(villarreal.querySelector(".team-picker-name")?.textContent).toBe("VIL");
    expect(villarreal.textContent).toContain("Villarreal CF");
    expect(picker.querySelector("a[title='FC Barcelona'] .team-picker-name")?.textContent).toBe("FC Barcelona");
  });

  it("TeamsPage_masthead_shows_the_league_position_and_sections_follow_the_requested_order", async () => {
    renderTeams("/teams/4");
    await screen.findByRole("heading", { name: "FC Barcelona" });
    const rank = document.querySelector(".team-rank") as HTMLElement;
    expect(rank.textContent).toContain("LaLiga position 3");
    expect(rank.textContent).toContain("45 pts");
    const tabs = [...screen.getByRole("navigation", { name: "Club sections" }).querySelectorAll("a")]
      .map((link) => link.textContent);
    expect(tabs).toEqual(["Performance", "Players", "Lineup", "News & Injuries"]);
    const ids = [...document.querySelectorAll(".team-page > section")].map((section) => section.id);
    expect(ids).toEqual(["team-performance", "team-players", "team-lineup", "team-news"]);
  });
});
