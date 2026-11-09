import { cleanup, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamPlayersSection, type SeasonStatsState } from "./TeamPlayersSection";

// ---- Mocks, fixtures & helpers ---- //

vi.mock("../lineup/useSquadStats", () => ({
  usePlayerOutlooks: () => ({
    profiles: new Map([
      ["1", { form: { rating: "good" }, startProbability: { percent: 95 } }],
    ]),
    isLoading: false,
    errors: [],
  }),
}));

vi.mock("../players/radar/usePlayerRadar", () => ({
  usePlayerRadar: () => ({
    displayed: {
      axes: [
        { key: "a", label: "Assists", percentile: 57.99999999999999 },
        { key: "b", label: "Dribbles", percentile: 90 },
      ],
    },
  }),
}));

const roster = {
  mvps: [{ playerId: "1", name: "Ana", points: 9, positionId: 4 }],
  players: [
    { playerId: "1", name: "Ana", positionId: 4, points: 9, stats: { goals: 2 } },
    { playerId: "2", name: "Bea", positionId: 2, points: 0, stats: { goals: 0 } },
  ],
  totals: { goals: 2 },
  coverage: { players: 2, matchweeks: [12], shortWindow: false },
};

function renderSection(
  injuries: Parameters<typeof TeamPlayersSection>[0]["injuries"],
  seasonStats?: SeasonStatsState,
) {
  return render(<TeamPlayersSection roster={roster} injuries={injuries} seasonStats={seasonStats} />);
}

const blank = {
  minutes: null, goals: null, assists: null, dribbles: null, penaltiesCommitted: null,
  penaltiesSaved: null, shots: null, recoveries: null, saves: null, ballsLost: null,
  yellowCards: null, redCards: null,
};

function season(overrides: Partial<SeasonStatsState> = {}): SeasonStatsState {
  return {
    loading: false,
    failed: false,
    onRetry: vi.fn(),
    data: {
      clubId: 4,
      season: "2026/27",
      scope: "laliga",
      source: "futbolfantasy",
      players: [
        { playerId: "1", available: true, stats: { ...blank, minutes: 550, goals: 4, redCards: 0 } },
        { playerId: "2", available: false, stats: blank },
      ],
      totals: { ...blank, minutes: 550, goals: 4, redCards: 0 },
      coverage: { requested: 2, read: 1, unavailable: 1 },
    },
    ...overrides,
  };
}

describe("TeamPlayersSection", () => {
  beforeEach(() => cleanup());

  // ---- Happy path ---- //

  it("TeamPlayersSection_mvp_shows_units_and_whole_percentiles", () => {
    renderSection({ published: true, items: [] });
    const card = document.querySelector(".team-mvp-card") as HTMLElement;
    expect(within(card).getByText("95%")).toBeTruthy();
    expect(within(card).getByText("Good")).toBeTruthy();
    expect(within(card).getByText("58")).toBeTruthy();
    expect(card.textContent).not.toContain("57.99");
  });

  it("TeamPlayersSection_injuries_render_as_a_table_with_status_badges", () => {
    renderSection({
      published: true,
      items: [{
        name: "Gorka Guruzeta",
        startedOn: "2026-10-17",
        expectedReturn: "Baja hasta mayo",
        status: "Rehabilitación",
      }],
    });
    const table = screen.getByRole("table", { name: "Injured players" });
    const row = within(table).getByRole("row", { name: /Gorka Guruzeta/ });
    expect(within(row).getByText("Rehabilitation")).toBeTruthy();
    expect(within(row).getByText("Baja hasta mayo")).toBeTruthy();
  });

  it("TeamPlayersSection_squad_keeps_a_published_zero_distinct_from_a_blank", () => {
    renderSection({ published: true, items: [] });
    const squad = screen.getByRole("region", { name: "Squad" });
    const bea = within(squad).getByRole("rowheader", { name: "Bea" }).closest("tr") as HTMLElement;
    expect(within(bea).getAllByText("0").length).toBeGreaterThan(0);
    expect(within(bea).getByText("DEF")).toBeTruthy();
  });

  it("TeamPlayersSection_season_totals_add_the_published_columns_and_totals", () => {
    renderSection({ published: true, items: [] }, season());
    const squad = screen.getByRole("region", { name: "Squad" });
    expect(within(squad).getByRole("button", { name: "Minutes" })).toBeTruthy();
    expect(within(squad).getByRole("button", { name: "Goals" })).toBeTruthy();
    expect(within(squad).queryByRole("button", { name: "Saves" })).toBeNull();
    const ana = within(squad).getByRole("rowheader", { name: "Ana" }).closest("tr") as HTMLElement;
    expect(within(ana).getByText("550")).toBeTruthy();
    const totals = within(squad).getByRole("rowheader", { name: "Totals" }).closest("tr") as HTMLElement;
    expect(within(totals).getByText("550")).toBeTruthy();
    expect(screen.getByText(/Counts are blank for 1 player without a published profile/)).toBeTruthy();
  });

  it("TeamPlayersSection_loading_and_failure_name_themselves_and_keep_the_table", () => {
    const onRetry = vi.fn();
    const { rerender } = renderSection(
      { published: true, items: [] },
      season({ data: undefined, loading: true }),
    );
    expect(screen.getByRole("status").textContent).toContain("Loading season statistics");
    expect(screen.getByRole("rowheader", { name: "Ana" })).toBeTruthy();
    rerender(
      <TeamPlayersSection
        roster={roster}
        injuries={{ published: true, items: [] }}
        seasonStats={season({ data: undefined, failed: true, onRetry })}
      />,
    );
    screen.getByRole("button", { name: "Retry" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // ---- Edge cases ---- //

  it("TeamPlayersSection_unpublished_injuries_are_not_an_empty_table", () => {
    renderSection({ published: false, items: [] });
    expect(screen.getByText("Current injuries are not published for this club.")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Injured players" })).toBeNull();
  });
});
