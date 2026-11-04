// ---- Mocks, fixtures & helpers ---- //
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { competitionStandingsSchema } from "../../api/schemas";
import { LaligaStandingsPanel } from "./LaligaStandingsPanel";
import { PlayersRankingPanel } from "./PlayersRankingPanel";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ accessToken: "app-jwt", user: { userId: "user-a" } }),
}));
const payload = JSON.parse(readFileSync(
  resolve(process.cwd(), "../contracts/standings-response.json"), "utf8",
)).payload;
let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;

function mount() {
  return render(<QueryClientProvider client={client}><LaligaStandingsPanel /></QueryClientProvider>);
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = vi.fn().mockImplementation(async () => Response.json(payload));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

// ---- Happy path ---- //
describe("LaligaStandingsPanel", () => {
  it("should display the ten requested columns and authoritative points for all twenty clubs", async () => {
    mount();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.getAttribute("aria-label")))
      .toEqual(["Ranking", "Team", "Score (league points)", "Matches won", "Matches tied",
        "Matches lost", "Goals scored", "Goals against", "Goal difference", "Last 5 matches"]);
    expect(within(table).getAllByRole("row")).toHaveLength(21);
    const first = within(table).getAllByRole("row")[1];
    expect(within(first).getAllByRole("cell").map((cell) => cell.textContent))
      .toEqual(["1", "16", "6", "0", "0", "6", "0", "+6", "WWWWW"]);
    expect(screen.getByRole("rowheader", { name: "Club 20" })).toBeTruthy();
    expect(screen.getByText("2026/27 · Completed matches")).toBeTruthy();
    expect(screen.getByText(/Source updated/)).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/competitions/1/standings?mode=completed");
  });

  it("should expose match details when a result is activated and restore focus on close", async () => {
    mount();
    const trigger = (await screen.findAllByRole("button", { name: /Win against Club/ }))[0];
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Club 1 1–0 Club 3")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("should show retrieval time when the provider update time is unknown", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...payload, sourceUpdatedAt: null }));
    mount();
    await screen.findByRole("table");
    expect(screen.getByText(/Retrieved/)).toBeTruthy();
    expect(screen.queryByText(/Source updated/)).toBeNull();
  });

  // ---- Error paths ---- //
  it("should explain a provider plan denial without treating it as inconsistent data", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(
      { error: "standings_plan_unavailable", detail: "Provider plan does not cover the data" },
      { status: 503 },
    ));
    mount();
    expect((await screen.findByRole("alert")).textContent)
      .toBe("The standings data provider does not cover this season.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("button", { name: "Retry standings" })).toBeTruthy();
  });

  it("should offer retry after a first-load provider failure without fabricating a table", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(
      { error: "standings_unavailable", detail: "Unavailable" }, { status: 503 },
    ));
    mount();
    expect((await screen.findByRole("alert")).textContent).toContain("standings are unavailable");
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry standings" }));
    await screen.findByRole("table");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("should preserve the cached table after a failed background refresh", async () => {
    mount();
    const table = await screen.findByRole("table");
    fetchMock.mockResolvedValueOnce(Response.json(
      { error: "standings_error", detail: "Inconsistent data" }, { status: 502 },
    ));
    const refresh = screen.getByRole("button", { name: "Refresh LALIGA standings" });
    refresh.focus();
    fireEvent.click(refresh);
    expect((await screen.findByRole("alert")).textContent).toContain("previously retrieved");
    expect(screen.getByRole("table")).toBe(table);
    expect(document.activeElement).toBe(refresh);
  });

  it("should reject a malformed successful response instead of showing empty rows", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...payload, rows: [] }));
    mount();
    expect((await screen.findByRole("alert")).textContent).toContain("temporarily inconsistent");
    expect(screen.queryByRole("table")).toBeNull();
  });

  // ---- Edge cases ---- //
  it("should preserve chronological W/D/L form without padding the missing matches", async () => {
    const response = structuredClone(payload);
    response.rows[0] = {
      ...response.rows[0], played: 3, won: 1, drawn: 1, lost: 1, points: 4,
      goalsFor: 1, goalsAgainst: 1, goalDifference: 0,
      last5Matches: response.rows[0].last5Matches.slice(0, 3).map((match: object, index: number) => ({
        ...match, result: ["W", "D", "L"][index],
        goalsFor: index === 0 ? 1 : 0, goalsAgainst: index === 2 ? 1 : 0,
      })),
    };
    fetchMock.mockResolvedValueOnce(Response.json(response));
    mount();
    const table = await screen.findByRole("table");
    const row = within(table).getAllByRole("row")[1];
    expect(within(row).getAllByRole("button").map((button) => button.textContent))
      .toEqual(["W", "D", "L"]);
    expect(within(row).getByRole("button", { name: /Draw against Club 4/ })).toBeTruthy();
  });

  it("should display short form, signed goal differences, missing badges and zero-game clubs", async () => {
    mount();
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(within(rows[2]).getAllByRole("cell").map((cell) => cell.textContent))
      .toEqual(["2", "0", "0", "0", "1", "0", "1", "-1", "L"]);
    expect(within(rows[8]).getByText("No completed matches")).toBeTruthy();
    expect(within(rows[8]).getAllByRole("cell")[7].textContent).toBe("0");
    expect(within(rows[1]).queryByRole("img")).toBeNull();
  });

  it("should show a loading state and cancel the request when the panel unmounts", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    });
    const view = mount();
    expect(screen.getByRole("status").textContent).toBe("Loading standings…");
    await waitFor(() => expect(signal).toBeDefined());
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("should reuse validated cached data without refetching on remount", async () => {
    client.setQueryData(["competition-standings", "user-a", 1, "current", "completed"],
      competitionStandingsSchema.parse(payload));
    const view = mount();
    expect(screen.getByRole("table")).toBeTruthy();
    view.unmount();
    mount();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const ranking = [
  {
    teamId: "mine", name: "My manager", position: 1, points: 15,
    avatarUrl: null, teamValue: null, selectable: true,
  },
  {
    teamId: "other", name: "Opponent", position: 2, points: 10,
    avatarUrl: null, teamValue: null, selectable: true,
  },
  {
    teamId: "unavailable", name: "Unavailable", position: 3, points: null,
    avatarUrl: null, teamValue: null, selectable: false,
  },
];

describe("PlayersRankingPanel", () => {
  it("should preserve manager selection, disabled rows, avatars and the current manager", () => {
    const onSelectTeam = vi.fn();
    render(<PlayersRankingPanel
      selectedTeamId="mine" onSelectTeam={onSelectTeam} ranking={ranking} />);
    expect(screen.getByRole("button", { name: /My manager/ }).getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Opponent/ }));
    expect(onSelectTeam).toHaveBeenCalledWith("other");
    const disabled = screen.getByRole("button", { name: /Unavailable/ });
    expect((disabled as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(disabled);
    expect(onSelectTeam).toHaveBeenCalledTimes(1);
  });

  it("PlayersRankingPanel_finished_fixture_labels_the_score_under_the_name", () => {
    const onSelectTeam = vi.fn();
    render(<PlayersRankingPanel selectedTeamId="mine" onSelectTeam={onSelectTeam} ranking={ranking}
      fixtureWeek={7}
      lastFixturePoints={new Map([["mine", 72], ["other", 0], ["unavailable", -3]])} />);
    const mine = screen.getByRole("button", { name: /My manager/ });
    expect(mine.querySelector(".rank-fixture")?.textContent).toBe("72");
    expect(mine.querySelector(".rank-fixture-week")).toBeNull();
    expect(mine.querySelector(".rank-points .rank-fixture")).toBeNull();
    expect(mine.textContent).toMatch(/Fixture 7 72/);
    expect(mine.textContent).toMatch(/Season\s+15 p/);
    const opponent = screen.getByRole("button", { name: /Fixture 7 0/ });
    fireEvent.click(opponent.querySelector(".rank-fixture")!);
    expect(onSelectTeam).toHaveBeenCalledWith("other");
    expect(screen.getByRole("button", { name: /Fixture 7 -3/ }).textContent).toMatch(/Season\s+—/);
  });

  it("PlayersRankingPanel_loading_fixture_keeps_managers_selectable", () => {
    render(<PlayersRankingPanel selectedTeamId="mine" onSelectTeam={vi.fn()} ranking={ranking}
      fixtureWeek={7} lastFixturePoints={null} />);
    expect(screen.getAllByRole("button", { name: /Fixture 7 Loading/ })).toHaveLength(3);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("PlayersRankingPanel_missing_fixture_score_reads_as_unavailable", () => {
    render(<PlayersRankingPanel selectedTeamId="mine" onSelectTeam={vi.fn()} ranking={ranking}
      fixtureWeek={7} lastFixturePoints={new Map([["mine", 72]])} />);
    expect(screen.getByRole("button", { name: /Opponent/ }).textContent)
      .toMatch(/Fixture 7 Unavailable/);
  });

  it("PlayersRankingPanel_fixture_failure_explains_that_scores_are_unavailable", () => {
    render(<PlayersRankingPanel selectedTeamId="mine" onSelectTeam={vi.fn()} ranking={ranking}
      fixtureWeek={7} lastFixturePoints={null} lastFixtureUnavailable />);
    expect(screen.getByRole("alert").textContent).toBe("Fixture 7 scores are unavailable.");
    expect(screen.getByRole("button", { name: /Opponent/ })).toBeTruthy();
  });

  it("PlayersRankingPanel_refresh_failure_keeps_the_previous_scores", () => {
    render(<PlayersRankingPanel selectedTeamId="mine" onSelectTeam={vi.fn()} ranking={ranking}
      fixtureWeek={7} lastFixturePoints={new Map([["mine", 72]])} lastFixtureUnavailable />);
    expect(screen.getByRole("alert").textContent).toBe("Fixture 7 scores could not be refreshed.");
    expect(screen.getByRole("button", { name: /My manager/ }).textContent).toMatch(/Fixture 7 72/);
  });

  it("PlayersRankingPanel_before_first_fixture_hides_the_fixture_column", () => {
    render(<PlayersRankingPanel selectedTeamId="mine" onSelectTeam={vi.fn()} ranking={ranking}
      fixtureWeek={0} />);
    expect(screen.queryByText("F7")).toBeNull();
    expect(screen.queryByText("Season")).toBeNull();
    expect(screen.getByRole("button", { name: /My manager/ }).textContent).not.toMatch(/Fixture/);
  });
});
