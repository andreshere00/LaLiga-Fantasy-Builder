import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamPlayersSection, type SeasonStatsState } from "./TeamPlayersSection";

// ---- Mocks, fixtures & helpers ---- //

vi.mock("../lineup/useSquadStats", () => ({
  usePlayerOutlooks: () => ({
    profiles: new Map(outlookState.value ? [["1", outlookState.value]] : []),
    isLoading: false,
    errors: [],
  }),
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

vi.mock("./useRecentPoints", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useRecentPoints")>()),
  useRecentPoints: () => new Map([[
    "1",
    [{ matchweek: 8, points: 2 }, { matchweek: 9, points: -1 }, { matchweek: 10, points: 12 },
      { matchweek: 11, points: null }, { matchweek: 12, points: 6 }],
  ]]),
}));

const outlookState = vi.hoisted(() => ({
  value: { form: { rating: "good" }, startProbability: { percent: 95 }, birthDate: "1990-01-01" } as Record<string, unknown> | undefined,
}));

vi.mock("../players/radar/usePlayerRadar", () => ({
  usePlayerRadar: () => ({
    displayed: {
      player: "Ana",
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

function renderSection(seasonStats?: SeasonStatsState) {
  return render(<MemoryRouter initialEntries={["/teams/3?x=1"]}><TeamPlayersSection roster={roster} seasonStats={seasonStats} /></MemoryRouter>);
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
  beforeEach(() => {
    cleanup();
    outlookState.value = { form: { rating: "good" }, startProbability: { percent: 95 }, birthDate: "1990-01-01" };
  });

  // ---- Happy path ---- //

  it("TeamPlayersSection_mvp_shows_units_and_whole_percentiles", () => {
    renderSection();
    const card = document.querySelector(".team-mvp-card") as HTMLElement;
    expect(within(card).getByText(/95%/)).toBeTruthy();
    expect(within(card).getByText("Good")).toBeTruthy();
    expect(within(card).getByText("58")).toBeTruthy();
    expect(card.textContent).not.toContain("57.99");
    expect(within(card).getByRole("img", { name: /Percentile radar for Ana/ })).toBeTruthy();
  });

  it("TeamPlayersSection_mvp_shows_position_and_age_when_published", () => {
    renderSection();
    const meta = document.querySelector(".team-mvp-meta")?.textContent ?? "";
    expect(meta).toMatch(/^[^·]+ · \d{2} years old$/);
  });

  it("TeamPlayersSection_mvp_omits_age_without_a_birth_date", () => {
    outlookState.value = { form: { rating: "good" }, startProbability: { percent: 50 } };
    renderSection();
    expect(document.querySelector(".team-mvp-meta")?.textContent).not.toContain("years");
  });

  it("TeamPlayersSection_mvp_lists_the_last_five_points_oldest_first", () => {
    renderSection();
    const items = [...document.querySelectorAll(".team-mvp-recent li")];
    expect(items.map((item) => item.textContent)).toEqual(["2", "-1", "12", "—", "6"]);
    expect(items.map((item) => item.getAttribute("data-tone"))).toEqual(["mid", "low", "high", null, "mid"]);
    expect(screen.getByRole("list", { name: /last 5 LaLiga matches/i })).toBeTruthy();
  });

  it("TeamPlayersSection_mvp_shows_the_catalog_photo", () => {
    renderSection();
    const photo = document.querySelector(".team-mvp-photo img") as HTMLImageElement | null;
    expect(photo?.getAttribute("src")).toBe("https://example.test/ana.png");
  });

  it.each([[89, undefined], [90, "high"], [95, "high"]])(
    "TeamPlayersSection_starter_at_%s_percent_has_level_%s",
    (percent, level) => {
      outlookState.value = { form: { rating: "good" }, startProbability: { percent } };
      renderSection();
      const value = document.querySelector(".team-mvp-facts > div:nth-child(2) dd");
      expect(value?.getAttribute("data-level") ?? undefined).toBe(level);
      expect(document.querySelector(".team-mvp-card .team-meter")?.getAttribute("data-tone") ?? undefined)
        .toBe(level ? "red" : undefined);
    },
  );

  it.each([
    ["very_good", "Very good", "very_good"],
    ["bad", "Poor", "bad"],
    ["mid", "Average", "mid"],
  ])("TeamPlayersSection_form_%s_shows_label_and_code", (rating, label, code) => {
    outlookState.value = { form: { rating }, startProbability: { percent: 50 } };
    renderSection();
    const form = document.querySelector(".team-mvp-form");
    expect(form?.getAttribute("data-form")).toBe(code);
    expect(form?.textContent).toBe(label);
  });

  it("TeamPlayersSection_unknown_form_and_missing_starter_render_dashes", () => {
    outlookState.value = { form: { rating: "weird" }, startProbability: null };
    renderSection();
    expect(document.querySelector(".team-mvp-form")).toBeNull();
    expect(document.querySelector(".team-mvp-card .team-meter")).toBeNull();
  });

  it("TeamPlayersSection_squad_keeps_a_published_zero_distinct_from_a_blank", () => {
    renderSection();
    const squad = screen.getByRole("region", { name: "Squad" });
    const bea = within(squad).getByRole("rowheader", { hidden: true, name: "Bea" })
      .closest("tr") as HTMLElement;
    expect(within(bea).getAllByText("0").length).toBeGreaterThan(0);
    expect(within(bea).getByText("DEF")).toBeTruthy();
  });

  it("TeamPlayersSection_season_totals_add_the_published_columns_and_totals", () => {
    renderSection(season());
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

  it("TeamPlayersSection_players_with_zero_minutes_wait_behind_a_toggle", () => {
    const data = season().data!;
    renderSection(season({
      data: {
        ...data,
        players: [
          data.players[0]!,
          { playerId: "2", available: true, stats: { ...blank, minutes: 0, goals: 0 } },
        ],
      },
    }));
    const squad = screen.getByRole("region", { name: "Squad" });
    const toggle = within(squad).getByRole("button", { name: /Show players without minutes/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const idle = document.getElementById("team-squad-idle") as HTMLElement;
    expect(idle.hidden).toBe(true);
    expect(within(idle).getByRole("rowheader", { hidden: true, name: "Bea" })).toBeTruthy();
    fireEvent.click(toggle);
    expect(idle.hidden).toBe(false);
    expect(within(squad).getByRole("button", { name: /Hide players without minutes/ })
      .getAttribute("aria-expanded")).toBe("true");
  });

  it("TeamPlayersSection_players_with_zero_FSYP_wait_behind_the_same_toggle", () => {
    renderSection();
    const squad = screen.getByRole("region", { name: "Squad" });
    expect(within(squad).getByRole("button", { name: /Show players without minutes/ })).toBeTruthy();
    const idle = document.getElementById("team-squad-idle") as HTMLElement;
    expect(within(idle).getByRole("rowheader", { hidden: true, name: "Bea" })).toBeTruthy();
    expect(within(squad).getByRole("rowheader", { name: "Ana" })).toBeTruthy();
  });

  it("TeamPlayersSection_squad_row_names_link_to_player_details", () => {
    renderSection();
    const link = screen.getByRole("link", { name: "Ana" });
    expect(link.getAttribute("href")).toBe("/players/1");
    expect(screen.queryAllByRole("link", { name: /Totals/ })).toHaveLength(0);
  });

  it("TeamPlayersSection_loading_and_failure_name_themselves_and_keep_the_table", () => {
    const onRetry = vi.fn();
    const { rerender } = renderSection(
      season({ data: undefined, loading: true }),
    );
    expect(screen.getByRole("status").textContent).toContain("Loading season statistics");
    expect(screen.getByRole("rowheader", { name: "Ana" })).toBeTruthy();
    rerender(
      <MemoryRouter>
        <TeamPlayersSection
          roster={roster}
          seasonStats={season({ data: undefined, failed: true, onRetry })}
        />
      </MemoryRouter>,
    );
    screen.getByRole("button", { name: "Retry" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // ---- Edge cases ---- //
});

describe("recentPointsFrom", () => {
  it("recentPointsFrom_keeps_only_laliga_rows_and_the_newest_five_oldest_first", async () => {
    const { recentPointsFrom } = await vi.importActual<typeof import("./useRecentPoints")>("./useRecentPoints");
    const row = (date: string, competition: string, points: number) => ({
      fixture: { date, competition, matchweek: Number(date.slice(-2)) },
      fantasyPointsTotal: points,
    });
    const result = recentPointsFrom({ fixtures: [
      row("2026-10-12", "laliga", 3), row("2026-10-09", "champions_league", 9),
      row("2026-10-05", "laliga", 1), row("2026-10-19", "laliga", 7),
    ] });
    expect(result.map((entry) => entry.points)).toEqual([1, 3, 7]);
    expect(recentPointsFrom(null)).toEqual([]);
  });
});
