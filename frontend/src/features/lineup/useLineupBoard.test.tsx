// ---- Mocks, fixtures & helpers ---- //

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { paths } from "../../api/client";
import { ApiError } from "../../api/errors";
import type { FantasyLeague, LineupRole } from "../../api/mappers";
import { useLineupBoard, type LineupBoard } from "./useLineupBoard";

const api = vi.hoisted(() => ({
  failedLineups: new Set<string>(),
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
  return { playerTeamId: id, playerMaster: { nickname: id, positionId } };
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

function respond(path: string): unknown {
  if (path === paths.currentWeek()) return { weekNumber: 8 };
  if (path === paths.playersCatalog()) return [];
  const standingMatch = /^\/api\/leagues\/([^/]+)\/standing(?:\/\d+)?$/.exec(path);
  if (standingMatch) return standings[standingMatch[1] ?? ""] ?? [];
  if (/^\/api\/leagues\/[^/]+\/teams$/.test(path)) return [];
  const teamMatch = /^\/api\/leagues\/([^/]+)\/teams\/([^/]+)$/.exec(path);
  if (teamMatch) return teams[`${teamMatch[1]}:${teamMatch[2]}`] ?? { players: [] };
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
    api.league = leagueA;
    api.getJson.mockReset();
    api.putJson.mockReset();
    api.getJson.mockImplementation((path: string) => respond(path));
    api.putJson.mockResolvedValue({});
  });

  it("useLineupBoard_rival_peek_restores_dirty_draft", async () => {
    const { result } = renderHook(() => useLineupBoard(), { wrapper: Wrapper });
    await loadCallerBoard(result);
    await swapInBench(result);
    expect(result.current.saveDisabled).toBe(false);
    expect(idsForRole(result.current, "defender")).toContain("d5");

    act(() => {
      result.current.selectTeam("team-b");
    });
    await waitFor(() => {
      expect(result.current.selectedTeamId).toBe("team-b");
      expect(result.current.lineupLoading).toBe(false);
      expect(result.current.editable).toBe(false);
    });

    act(() => {
      result.current.selectTeam("team-a");
    });
    await waitFor(() => {
      expect(result.current.selectedTeamId).toBe("team-a");
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
          tactical_formation: [4, 4, 2],
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
    expect(requested).toContain(paths.lineup("team-b"));
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
