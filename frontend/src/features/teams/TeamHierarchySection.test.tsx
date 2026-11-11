import { Link, MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamHierarchySection } from "./TeamHierarchySection";

// ---- Mocks, fixtures & helpers ---- //

const state = vi.hoisted(() => ({
  requested: [] as string[][],
  loading: false,
  profiles: new Map<string, unknown>(),
}));

vi.mock("../lineup/useSquadStats", () => ({
  usePlayerOutlooks: (ids: string[]) => {
    state.requested.push([...ids]);
    return { profiles: state.profiles, isLoading: state.loading, errors: [] };
  },
}));

vi.mock("../../api/queries", () => ({
  usePlayersCatalogQuery: () => ({
    data: [{ id: "1", images: { transparent: { "256x256": "https://example.test/ana.png" } } }],
  }),
}));

vi.mock("../shell/ProfilePhoto", () => ({
  ProfilePhoto: ({ url, className }: { url: string | null; className?: string }) => (
    <span className={className}>{url ? <img src={url} alt="" /> : null}</span>
  ),
}));

const players = [
  { playerId: "1", name: "Ana", positionId: 4, points: 30, stats: {} },
  { playerId: "2", name: "Bea", positionId: 2, points: 10, stats: {} },
  { playerId: "3", name: "Cris", positionId: 3, points: 2, stats: {} },
] as never;

function renderSection(idleIds?: ReadonlySet<string>) {
  return render(
    <MemoryRouter>
      <TeamHierarchySection players={players} returnTo="/teams/3" idleIds={idleIds} />
    </MemoryRouter>,
  );
}

describe("TeamHierarchySection", () => {
  beforeEach(() => {
    cleanup();
    state.requested = [];
    state.loading = false;
    state.profiles = new Map([
      ["1", { hierarchy: { label: "Clave", rank: 2 } }],
      ["2", { hierarchy: { label: "Reserva", rank: 6 } }],
      ["3", { hierarchy: { label: null, rank: null } }],
    ]);
  });

  // ---- Happy path ---- //

  it("TeamHierarchySection_closed_requests_no_profiles_and_describes_the_list", () => {
    renderSection();
    expect(screen.getByRole("heading", { name: "Hierarchy levels" })).toBeTruthy();
    expect(state.requested.every((ids) => ids.length === 0)).toBe(true);
    expect(document.querySelector("#team-summary-hierarchy")?.textContent)
      .toContain("A list of every player grouped by squad role");
  });

  it("TeamHierarchySection_hash_link_followed_while_mounted_opens_the_list", () => {
    render(
      <MemoryRouter initialEntries={["/teams/3"]}>
        <Link to="/teams/3#team-hierarchy">Hierarchy link</Link>
        <TeamHierarchySection players={players} returnTo="/teams/3" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Hierarchy link" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(state.requested.at(-1)).toEqual(["1", "2", "3"]);
  });

  it("TeamHierarchySection_open_lists_every_player_under_their_level", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "View hierarchy levels" }));
    const dialog = screen.getByRole("dialog");
    const groups = within(dialog).getAllByRole("heading", { level: 3 });
    expect(groups.map((heading) => heading.textContent)).toEqual([
      "Key player1", "Reserve1", "Unavailable1",
    ]);
    expect(within(dialog).getByRole("link", { name: "Ana" }).getAttribute("href")).toBe("/players/1");
    expect(within(dialog).getByRole("link", { name: "Cris" })).toBeTruthy();
    expect(state.requested.at(-1)).toEqual(["1", "2", "3"]);
  });

  it("TeamHierarchySection_loaded_shows_the_level_tally_under_the_heading", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "View hierarchy levels" }));
    const tally = document.querySelector(".team-hier-chips");
    expect(tally?.getAttribute("aria-describedby")).toBe("team-summary-hierarchy");
    expect(tally?.querySelectorAll("li")).toHaveLength(3);
  });

  it("TeamHierarchySection_players_without_minutes_stay_hidden_until_the_toggle_is_used", () => {
    renderSection(new Set(["2", "3"]));
    fireEvent.click(screen.getByRole("button", { name: "View hierarchy levels" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("heading", { level: 3 }).map((h) => h.textContent))
      .toEqual(["Key player1"]);
    expect(within(dialog).queryByRole("link", { name: "Bea" })).toBeNull();
    expect(document.querySelectorAll(".team-hier-chips li")).toHaveLength(1);

    fireEvent.click(within(dialog).getByRole("button", { name: /Show players without minutes/ }));
    expect(within(dialog).getAllByRole("heading", { level: 3 })).toHaveLength(3);
    expect(within(dialog).getByRole("link", { name: "Bea" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Hide players without minutes/ })).toBeTruthy();
  });

  it("TeamHierarchySection_nobody_without_minutes_offers_no_toggle", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "View hierarchy levels" }));
    expect(screen.queryByRole("button", { name: /without minutes/ })).toBeNull();
  });

  // ---- Edge cases ---- //

  it("TeamHierarchySection_loading_shows_progress_instead_of_a_partial_list", () => {
    state.loading = true;
    state.profiles = new Map([["1", { hierarchy: { label: "Clave", rank: 2 } }]]);
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "View hierarchy levels" }));
    expect(within(screen.getByRole("dialog")).getByRole("status").textContent)
      .toBe("Loading roles: 1 of 3.");
    expect(document.querySelector("section.team-hier-group")).toBeNull();
    expect(document.querySelectorAll(".fb-skeleton").length).toBeGreaterThan(0);
    expect(document.querySelector(".fb-skeleton")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("TeamHierarchySection_open_shows_the_catalog_photo_of_each_player_when_there_is_one", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "View hierarchy levels" }));
    const rows = [...document.querySelectorAll(".team-hier-player")];
    expect(rows.find((row) => row.textContent?.includes("Ana"))?.querySelector("img")?.getAttribute("src"))
      .toBe("https://example.test/ana.png");
    expect(rows.find((row) => row.textContent?.includes("Bea"))?.querySelector("img")).toBeNull();
  });

  it("TeamHierarchySection_empty_squad_renders_nothing", () => {
    const { container } = render(
      <MemoryRouter><TeamHierarchySection players={[]} returnTo="/teams/3" /></MemoryRouter>,
    );
    expect(container.textContent).toBe("");
  });
});
