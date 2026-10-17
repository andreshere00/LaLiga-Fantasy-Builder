// ---- Mocks, fixtures & helpers ---- //

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { paths } from "../../api/client";
import response from "../../../../contracts/lineup-builder-response.json";
import { lineupBuildResponseSchema } from "../../api/schemas";
import { ApiContractError, ApiError } from "../../api/errors";
import type { FantasyLeague, LineupRole } from "../../api/mappers";
import { useLineupBoard, type LineupBoard } from "./useLineupBoard";

const api = vi.hoisted(() => ({
  failedLineups: new Set<string>(),
  scoringLineups: {} as Record<string, unknown>,
  fixtureStarted: false,
  roundLive: false,
  openingDate: "",
  league: null as FantasyLeague | null,
  getJson: vi.fn(),
  putJson: vi.fn(),
}));

vi.mock("../../api/client", async () => {
  const actual = await vi.importActual<typeof import("../../api/client")>("../../api/client");
  return { ...actual, getJson: api.getJson, putJson: api.putJson };
});

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    accessToken: "token",
    managerName: "Me",
    managerAvatar: null,
    markNeedsReauth: () => undefined,
  }),
}));

vi.mock("./LeagueProvider", () => ({
  useLeague: () => ({
    leagues: api.league ? [api.league] : [],
    selected: api.league,
    selectLeague: () => undefined,
    isLoading: false,
    error: null,
  }),
}));

const CALLER_XI = {
  gk: ["gk"],
  def: ["d1", "d2", "d3", "d4"],
  mid: ["m1", "m2", "m3", "m4"],
  st: ["s1", "s2"],
};

function league(id: string, teamId: string): FantasyLeague {
  return {
    id,
    name: id,
    team: { id: teamId, manager: { managerName: "Me" } },
  };
}

const leagueA = league("league-a", "team-a");
const leagueB = league("league-b", "team-c");

function slot(id: string, positionId: number) {
  return { playerTeamId: id, playerMaster: { id: `master-${id}`, nickname: id, positionId } };
}

function lineupFor(ids: { gk: string[]; def: string[]; mid: string[]; st: string[] }) {
  return {
    formation: {
      tacticalFormation: [4, 4, 2],
      goalkeeper: ids.gk.map((id) => slot(id, 1)),
      defender: ids.def.map((id) => slot(id, 2)),
      midfield: ids.mid.map((id) => slot(id, 3)),
      striker: ids.st.map((id) => slot(id, 4)),
    },
  };
}

function standing(rows: { id: string; name: string; position: number }[]) {
  return rows.map((row) => ({
    position: row.position,
    points: 10,
    team: {
      id: row.id,
      teamValue: 1000,
      manager: { managerName: row.name },
    },
  }));
}

const standings: Record<string, ReturnType<typeof standing>> = {
  "league-a": standing([
    { id: "team-a", name: "Me", position: 1 },
    { id: "team-b", name: "Rival", position: 2 },
  ]),
  "league-b": standing([{ id: "team-c", name: "Me", position: 1 }]),
};

const lineups: Record<string, ReturnType<typeof lineupFor>> = {
  "team-a": lineupFor(CALLER_XI),
  "team-b": lineupFor({
    gk: ["rgk"],
    def: ["rd1", "rd2", "rd3", "rd4"],
    mid: ["rm1", "rm2", "rm3", "rm4"],
    st: ["rs1", "rs2"],
  }),
};

function squadPlayers(ids: string[], bench: string[] = []) {
  const positioned = [
    ...ids.slice(0, 1).map((id) => slot(id, 1)),
    ...ids.slice(1, 5).map((id) => slot(id, 2)),
    ...ids.slice(5, 9).map((id) => slot(id, 3)),
    ...ids.slice(9).map((id) => slot(id, 4)),
    ...bench.map((id) => slot(id, 2)),
  ];
  return { players: positioned };
}

const teams: Record<string, { players: ReturnType<typeof slot>[] }> = {
  "league-a:team-a": squadPlayers(
    ["gk", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "s1", "s2"],
    ["d5"],
  ),
  "league-a:team-b": squadPlayers([
    "rgk",
    "rd1",
    "rd2",
    "rd3",
    "rd4",
    "rm1",
    "rm2",
    "rm3",
    "rm4",
    "rs1",
    "rs2",
  ]),
  "league-b:team-c": squadPlayers([
    "cgk",
    "cd1",
    "cd2",
    "cd3",
    "cd4",
    "cm1",
    "cm2",
    "cm3",
    "cm4",
    "cs1",
    "cs2",
  ]),
};

const template = lineupBuildResponseSchema.parse(response.payload).candidates[0];
const ownedCandidate = {
  ...template,
  formation: "4,4,2",
  starters: teams["league-a:team-a"].players.slice(0, 11).map((p, i) => ({
    ...template.starters[i], playerId: p.playerMaster.id, position: p.playerMaster.positionId,
  })),
};

function respond(path: string): unknown {
  if (path === paths.currentWeek()) {
    return {
      weekNumber: 8,
      isLive: api.roundLive,
      openingWeekDate: api.openingDate,
    };
  }
  if (path === paths.weekFixtures(8)) {
    return [{ matchDate: api.openingDate, matchState: api.fixtureStarted ? 2 : 1 }];
  }
  if (path === paths.playersCatalog()) return [];
  const standingMatch = /^\/api\/leagues\/([^/]+)\/standing(?:\/\d+)?$/.exec(path);
  if (standingMatch) return standings[standingMatch[1] ?? ""] ?? [];
  if (/^\/api\/leagues\/[^/]+\/teams$/.test(path)) return [];
  const teamMatch = /^\/api\/leagues\/([^/]+)\/teams\/([^/]+)$/.exec(path);
  if (teamMatch) return teams[`${teamMatch[1]}:${teamMatch[2]}`] ?? { players: [] };
  const scoringMatch = /^\/api\/teams\/([^/]+)\/lineup\/week\/(\d+)$/.exec(path);
  if (scoringMatch) return api.scoringLineups[`${scoringMatch[1]}:${scoringMatch[2]}`] ?? [];
  const lineupMatch = /^\/api\/teams\/([^/]+)\/lineup$/.exec(path);
  if (lineupMatch) {
    const teamId = lineupMatch[1] ?? "";
    if (api.failedLineups.has(teamId)) throw new ApiError(404, "not_found");
    return lineups[teamId] ?? { formation: {} };
  }
  return [];
}

function playerIds(board: LineupBoard): string[] {
  return board.groups.flatMap((group) => group.players.map((player) => player.id));
}

function idsForRole(board: LineupBoard, role: LineupRole): string[] {
  return (
    board.groups.find((group) => group.role === role)?.players.map((player) => player.id) ??
    []
  );
}

let queryClient: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function loadCallerBoard(
  result: { current: LineupBoard },
): Promise<void> {
  await waitFor(() => {
    expect(result.current.week).toBe(8);
    expect(result.current.editable).toBe(true);
    expect(result.current.lineupLoading).toBe(false);
    expect(result.current.squadLoading).toBe(false);
    expect(result.current.formationCode).toBe("4,4,2");
    expect(result.current.saveDisabled).toBe(true);
    expect(result.current.saveNoChangesTooltip).toBe(
      "No changes detected from last lineup",
    );
    expect(result.current.unplayedFixtureScoreTooltip).toContain(
      "This fixture has not been played yet.",
    );
  });
}

async function swapInBench(result: { current: LineupBoard }): Promise<void> {
  await waitFor(() => {
    act(() => {
      result.current.selectPitchPlayer("defender", "d1");
    });
    act(() => {
      result.current.pickSquadPlayer("d5");
    });
    expect(idsForRole(result.current, "defender")).toContain("d5");
  });
}

// ---- Happy path ---- //

describe("useLineupBoard", () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    api.failedLineups.clear();
    api.scoringLineups = {};
    api.fixtureStarted = false;
    api.roundLive = false;
    api.openingDate = new Date(Date.now() + 7 * 86400_000).toISOString();
    api.league = leagueA;
    api.getJson.mockReset();
    api.putJson.mockReset();
    api.getJson.mockImplementation((path: string) => respond(path));
    api.putJson.mockResolvedValue({});
  });

  it.each(["live", "fixture", "kickoff"])("should open the owned draft's next round after %s starts", async (signal) => {
    api.roundLive = signal === "live";
    api.fixtureStarted = signal === "fixture";
    if (signal === "kickoff") api.openingDate = new Date(Date.now() - 3600_000).toISOString();
    const { result } = renderHook(() => useLineupBoard(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.canApplyBuilder(ownedCandidate, 9)).toBe(true));
    expect(result.current.week).toBe(8);
    expect(result.current.canApplyBuilder(ownedCandidate, 8)).toBe(false);
    expect(result.current.canApplyBuilder(ownedCandidate, 10)).toBe(false);
    act(() => { expect(result.current.applyBuilder(ownedCandidate, 9)).toBe(true); });
    await waitFor(() => {
      expect(result.current.week).toBe(9);
      expect(result.current.editable).toBe(true);
      expect(result.current.draftDirty).toBe(true);
      expect(result.current.lineupLoading).toBe(false);
    });
    expect(playerIds(result.current)).toEqual(Object.values(CALLER_XI).flat());
    expect(result.current.builderDraftDirty(9)).toBe(true);
    expect(result.current.builderDraftDirty(8)).toBe(false);
    expect(api.putJson).not.toHaveBeenCalled();
    act(() => result.current.goToWeek(7));
    expect(result.current.builderDraftDirty(9)).toBe(true);
    act(() => result.current.goToWeek(9));
    expect(result.current.draftDirty).toBe(true);
  });

  it("should apply an owned candidate to the unstarted current round", async () => {
    const { result } = renderHook(() => useLineupBoard(), { wrapper: Wrapper });
    await loadCallerBoard(result);
    expect(result.current.canApplyBuilder(ownedCandidate, 8)).toBe(true);
    expect(result.current.canApplyBuilder(ownedCandidate, 9)).toBe(false);
    act(() => { expect(result.current.applyBuilder(ownedCandidate, 8)).toBe(true); });
    expect(result.current.builderDraftDirty(8)).toBe(true);
    expect(api.putJson).not.toHaveBeenCalled();
  });

  it("should keep missing players, unsupported formations and opponents blocked", async () => {
    api.roundLive = true;
    const { result } = renderHook(() => useLineupBoard(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.canApplyBuilder(ownedCandidate, 9)).toBe(true));
    const missing = { ...ownedCandidate, starters: ownedCandidate.starters.map((p, i) => i === 0 ? { ...p, playerId: "not-owned" } : p) };
    expect(result.current.canApplyBuilder(missing, 9)).toBe(false);
    expect(result.current.applyBuilder(missing, 9)).toBe(false);
    expect(result.current.canApplyBuilder({ ...ownedCandidate, formation: "3,3,4" }, 9)).toBe(false);
    act(() => result.current.selectTeam("team-b"));
    await waitFor(() => expect(result.current.selectedTeamId).toBe("team-b"));
    expect(result.current.canApplyBuilder(ownedCandidate, 9)).toBe(false);
    expect(result.current.applyBuilder(ownedCandidate, 9)).toBe(false);
    expect(api.putJson).not.toHaveBeenCalled();
  });

  it("useLineupBoard_rival_selected_on_past_week_keeps_week", async () => {
    const { result } = renderHook(() => useLineupBoard(), { wrapper: Wrapper });
    await loadCallerBoard(result);
    act(() => {
      result.current.goToWeek(5);
    });
    act(() => {
      result.current.selectTeam("team-b");
    });
    await waitFor(() => {
      expect(result.current.selectedTeamId).toBe("team-b");
      expect(result.current.week).toBe(5);
    });
  });

  it("useLineupBoard_rival_peek_pager_then_caller_restores_open_week", async () => {
    const { result } = renderHook(() => useLineupBoard(), { wrapper: Wrapper });
    await loadCallerBoard(result);
    await swapInBench(result);

    act(() => {
      result.current.selectTeam("team-b");
    });
    await waitFor(() => {
      expect(result.current.week).toBe(7);
    });

    act(() => {
      result.current.goToWeek(5);
    });
    await waitFor(() => {
      expect(result.current.week).toBe(5);
    });

    act(() => {
      result.current.selectTeam("team-a");
    });
    await waitFor(() => {
      expect(result.current.week).toBe(8);
      expect(result.current.saveDisabled).toBe(false);
      expect(idsForRole(result.current, "defender")).toContain("d5");
    });
  });

  it("useLineupBoard_rival_peek_restores_dirty_draft", async () => {
    const { result } = renderHook(() => useLineupBoard(), { wrapper: Wrapper });
    await loadCallerBoard(result);
    await swapInBench(result);
    expect(result.current.saveDisabled).toBe(false);
    expect(result.current.saveNoChangesTooltip).toBeNull();
    expect(idsForRole(result.current, "defender")).toContain("d5");

    act(() => {
      result.current.selectTeam("team-b");
    });
    await waitFor(() => {
      expect(result.current.selectedTeamId).toBe("team-b");
      expect(result.current.lineupLoading).toBe(false);
      expect(result.current.week).toBe(7);
      expect(result.current.editable).toBe(false);
      expect(result.current.opponentLineupLocked).toBe(false);
    });

    act(() => {
      result.current.selectTeam("team-a");
    });
    await waitFor(() => {
      expect(result.current.selectedTeamId).toBe("team-a");
      expect(result.current.week).toBe(8);
      expect(result.current.editable).toBe(true);
      expect(result.current.saveDisabled).toBe(false);
      expect(idsForRole(result.current, "defender")).toContain("d5");
    });
  });

  it("useLineupBoard_save_success_invalidates_lineup_for_league_and_team", async () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useLineupBoard(), { wrapper: Wrapper });
    await loadCallerBoard(result);
    await swapInBench(result);

    act(() => {
      result.current.saveLineup();
    });

    await waitFor(() => {
      expect(api.putJson).toHaveBeenCalledWith(
        paths.lineup("team-a"),
        "token",
        expect.objectContaining({
          defender: ["d5", "d2", "d3", "d4"],
          tacticalFormation: [4, 4, 2],
        }),
      );
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["lineup", "league-a", "team-a"],
        }),
      );
    });
  });

  it("useLineupBoard_invalid_save_response_refreshes_reads_without_retry", async () => {
    const refetch = vi.spyOn(queryClient, "refetchQueries");
    api.putJson.mockRejectedValue(new ApiContractError());
    const { result } = renderHook(() => useLineupBoard(), { wrapper: Wrapper });
    await loadCallerBoard(result);
    await swapInBench(result);
    act(() => result.current.saveLineup());
    await waitFor(() => {
      expect(refetch).toHaveBeenCalledWith({ queryKey: ["lineup", "league-a"] });
      expect(refetch).toHaveBeenCalledWith({ queryKey: ["team", "league-a"] });
    });
    expect(api.putJson).toHaveBeenCalledTimes(1);
  });

  it("useLineupBoard_restore_last_saved_discards_swaps_and_formation_without_saving", async () => {
    const { result } = renderHook(() => useLineupBoard(), { wrapper: Wrapper });
    await waitFor(() => {
      expect(result.current.editable).toBe(true);
      expect(result.current.formationCode).toBe("4,4,2");
      expect(result.current.squadLoading).toBe(false);
    });
    await swapInBench(result);
    act(() => result.current.setFormationCode("5,3,2"));
    expect(result.current.lastSavedLineupAvailable).toBe(true);

    act(() => result.current.restoreLastSavedLineup());

    expect(result.current.formationCode).toBe("4,4,2");
    expect(idsForRole(result.current, "defender")).toEqual(CALLER_XI.def);
    expect(result.current.lastSavedLineupAvailable).toBe(false);
    expect(result.current.saveDisabled).toBe(true);
    expect(result.current.pitchSelection).toBeNull();
    expect(api.putJson).not.toHaveBeenCalled();

    act(() => result.current.selectTeam("team-b"));
    await waitFor(() => expect(result.current.selectedTeamId).toBe("team-b"));
    act(() => {
      result.current.selectTeam("team-a");
      result.current.goToWeek(8);
    });
    await waitFor(() => {
      expect(result.current.selectedTeamId).toBe("team-a");
      expect(result.current.formationCode).toBe("4,4,2");
      expect(idsForRole(result.current, "defender")).toEqual(CALLER_XI.def);
      expect(result.current.lastSavedLineupAvailable).toBe(false);
    });
  });

  it("useLineupBoard_loads_fixture_scoring_snapshot_separately_from_last_saved", async () => {
    api.fixtureStarted = true;
    const scoring = lineupFor({ ...CALLER_XI, def: ["historic-d", "d2", "d3", "d4"] });
    api.scoringLineups["team-a:8"] = {
      ...scoring,
      formation: { ...scoring.formation, captain: "gk" },
    };
    const { result } = renderHook(() => useLineupBoard(), { wrapper: Wrapper });
    await waitFor(() => {
      expect(result.current.originalLineupAvailable).toBe(true);
      expect(idsForRole(result.current, "defender")).toEqual(CALLER_XI.def);
    });

    act(() => result.current.restoreOriginalLineup());

    expect(idsForRole(result.current, "defender")).toEqual(["historic-d", "d2", "d3", "d4"]);
    expect(result.current.groups.flatMap((group) => group.players)
      .find((player) => player.id === "historic-d")?.name).toBe("historic-d");
    expect(result.current.captainId).toBe("gk");
    expect(result.current.lastSavedLineupAvailable).toBe(true);
    expect(result.current.saveDisabled).toBe(false);
    expect(api.getJson).toHaveBeenCalledWith(paths.lineupWeek("team-a", 8), "token", expect.anything());
    expect(api.putJson).not.toHaveBeenCalled();

    act(() => result.current.restoreLastSavedLineup());

    expect(idsForRole(result.current, "defender")).toEqual(CALLER_XI.def);
    expect(result.current.captainId).toBeNull();
    expect(result.current.saveDisabled).toBe(true);
    expect(result.current.originalLineupAvailable).toBe(true);
  });

  it("useLineupBoard_missing_scoring_snapshot_does_not_substitute_last_saved", async () => {
    api.fixtureStarted = true;
    const { result } = renderHook(() => useLineupBoard(), { wrapper: Wrapper });
    await waitFor(() => {
      expect(result.current.originalLineupMessage).toContain("not available yet");
      expect(result.current.formationCode).toBe("4,4,2");
      expect(result.current.squadLoading).toBe(false);
    });
    await swapInBench(result);

    act(() => result.current.restoreOriginalLineup());

    expect(result.current.originalLineupAvailable).toBe(false);
    expect(idsForRole(result.current, "defender")).toContain("d5");
    expect(result.current.lastSavedLineupAvailable).toBe(true);
    expect(api.putJson).not.toHaveBeenCalled();
  });

  // ---- Error paths ---- //

  it("useLineupBoard_dirty_draft_after_league_switch_save_stays_disabled", async () => {
    const { result, rerender } = renderHook(() => useLineupBoard(), { wrapper: Wrapper });
    await loadCallerBoard(result);
    await swapInBench(result);
    expect(idsForRole(result.current, "defender")).toContain("d5");

    api.league = leagueB;
    rerender();

    await waitFor(() => {
      expect(result.current.selectedTeamId).toBe("team-c");
      expect(result.current.lineupLoading).toBe(false);
      expect(result.current.saveDisabled).toBe(true);
    });
    act(() => {
      result.current.saveLineup();
    });
    expect(api.putJson).not.toHaveBeenCalled();
    expect(playerIds(result.current)).not.toContain("d5");
    expect(playerIds(result.current)).not.toContain("d1");
  });

  it("useLineupBoard_initialTeamId_selects_valid_standing_team", async () => {
    const { result } = renderHook(() => useLineupBoard({ initialTeamId: "team-b" }), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(result.current.selectedTeamId).toBe("team-b");
    });
  });

  it("useLineupBoard_initialTeamId_valid_never_fetches_caller_lineup", async () => {
    api.getJson.mockImplementation(async (path: string) => {
      if (/\/standing$/.test(path)) await new Promise((resolve) => setTimeout(resolve, 60));
      return respond(path);
    });
    const { result } = renderHook(() => useLineupBoard({ initialTeamId: "team-b" }), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.selectedTeamId).toBe("team-b");
      expect(result.current.lineupLoading).toBe(false);
    });

    const requested = api.getJson.mock.calls.map(([path]) => String(path));
    expect(requested).not.toContain(paths.lineup("team-a"));
    expect(requested).toContain(paths.lineupWeek("team-b", 8));
  });

  it("useLineupBoard_initialTeamId_unknown_falls_back_to_caller", async () => {
    const { result } = renderHook(() => useLineupBoard({ initialTeamId: "missing" }), {
      wrapper: Wrapper,
    });
    await waitFor(() => {
      expect(result.current.selectedTeamId).toBe("team-a");
    });
  });

  it("useLineupBoard_failed_lineup_after_league_switch_save_stays_disabled", async () => {
    const { result, rerender } = renderHook(() => useLineupBoard(), { wrapper: Wrapper });
    await loadCallerBoard(result);
    await swapInBench(result);

    api.failedLineups.add("team-c");
    api.league = leagueB;
    rerender();

    await waitFor(() => {
      expect(result.current.selectedTeamId).toBe("team-c");
      expect(result.current.lineupLoading).toBe(false);
      expect(result.current.lineupMessage).toBeTruthy();
      expect(result.current.saveDisabled).toBe(true);
    });
    act(() => {
      result.current.saveLineup();
    });
    expect(api.putJson).not.toHaveBeenCalled();
    expect(playerIds(result.current)).not.toContain("d5");
    expect(playerIds(result.current)).not.toContain("d1");
  });
});
