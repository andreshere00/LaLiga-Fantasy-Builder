import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import response from "../../../../contracts/lineup-builder-response.json";
import { lineupBuildResponseSchema, type LineupBuildRequest } from "../../api/schemas";
import { streamLineupBuild } from "../../api/lineupBuild";
import { ApiError, NeedsReauthError } from "../../api/errors";
import { useLineupBuilder } from "./useLineupBuilder";

vi.mock("../../api/lineupBuild", () => ({ streamLineupBuild: vi.fn() }));
const { markNeedsReauth } = vi.hoisted(() => ({ markNeedsReauth: vi.fn() }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ markNeedsReauth }) }));
const preferences: LineupBuildRequest = { sources: ["owned"], mandatoryPlayerIds: [], formations: [], allowBuying: false,
  allowSelling: false, includeTradingPurchases: false, maxCandidates: 5, explanation: { enabled: false } };

beforeEach(() => vi.clearAllMocks());
describe("useLineupBuilder", () => {
  it("should request reconnection when a build discovers expired pairing", async () => {
    vi.mocked(streamLineupBuild).mockRejectedValueOnce(new NeedsReauthError());
    const { result } = renderHook(() => useLineupBuilder("l1", "token"));
    await act(() => result.current.build(preferences));
    expect(markNeedsReauth).toHaveBeenCalledOnce();
    expect(result.current.error).toContain("Reconnect");
    expect(result.current.pending).toBe(false);
  });

  it("should ignore a reconnect error from a cancelled build", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(streamLineupBuild).mockImplementationOnce(() => new Promise((_resolve, fail) => {
      reject = fail;
    }));
    const { result } = renderHook(() => useLineupBuilder("l1", "token"));
    let pending!: Promise<void>;
    act(() => { pending = result.current.build(preferences); });
    act(() => result.current.cancel());
    await act(async () => { reject(new NeedsReauthError()); await pending; });
    expect(markNeedsReauth).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("should expose live progress and ignore updates from a cancelled build", async () => {
    const callbacks: Parameters<typeof streamLineupBuild>[3][] = [];
    const resolves: ((value: Awaited<ReturnType<typeof streamLineupBuild>>) => void)[] = [];
    vi.mocked(streamLineupBuild).mockImplementation((_league, _token, _preferences, onProgress) => {
      callbacks.push(onProgress);
      return new Promise((resolve) => resolves.push(resolve));
    });
    const { result } = renderHook(() => useLineupBuilder("l1", "token"));
    let first!: Promise<void>;
    act(() => { first = result.current.build(preferences); });
    act(() => callbacks[0]({ stage: "players", percent: 40, completedPlayers: 4, totalPlayers: 10 }));
    expect(result.current.progress?.percent).toBe(40);
    act(() => result.current.cancel());
    expect(result.current.progress).toBeNull();
    let second!: Promise<void>;
    act(() => { second = result.current.build(preferences); });
    act(() => callbacks[1]({ stage: "sources", percent: 0, completedPlayers: 0, totalPlayers: 0 }));
    act(() => callbacks[0]({ stage: "complete", percent: 100, completedPlayers: 0, totalPlayers: 0 }));
    expect(result.current.progress?.percent).toBe(0);
    await act(async () => {
      resolves[0](lineupBuildResponseSchema.parse(response.payload));
      await first;
    });
    expect(result.current.pending).toBe(true);
    expect(result.current.result).toBeNull();
    await act(async () => {
      resolves[1](lineupBuildResponseSchema.parse(response.payload));
      await second;
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(result.current.result?.buildId).toBe("fixture");
  });
  it("should discard a late result after cancellation", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof streamLineupBuild>>) => void;
    vi.mocked(streamLineupBuild).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { result } = renderHook(() => useLineupBuilder("l1", "token"));
    let pending!: Promise<void>;
    act(() => { pending = result.current.build(preferences); });
    act(() => result.current.cancel());
    await act(async () => { resolve(lineupBuildResponseSchema.parse(response.payload)); await pending; });
    expect(result.current.result).toBeNull();
    expect(result.current.pending).toBe(false);
  });
  it("should preserve a successful result as stale when refresh fails", async () => {
    vi.mocked(streamLineupBuild).mockResolvedValueOnce(lineupBuildResponseSchema.parse(response.payload))
      .mockRejectedValueOnce(new ApiError(503, "financial_data_unavailable"));
    const { result } = renderHook(() => useLineupBuilder("l1", "token"));
    await act(() => result.current.build(preferences));
    await act(() => result.current.build(preferences));
    expect(result.current.result?.buildId).toBe("fixture");
    expect(result.current.error).toContain("Cash");
  });
  it("should abort in-flight work when its session scope unmounts", () => {
    vi.mocked(streamLineupBuild).mockImplementation(() => new Promise(() => {}));
    const { result, unmount } = renderHook(() => useLineupBuilder("l1", "token"));
    act(() => { void result.current.build(preferences); });
    const signal = vi.mocked(streamLineupBuild).mock.calls[0][4]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});

it("should explain missing bid coverage without asking the user to resolve nonexistent bids", async () => {
  vi.mocked(streamLineupBuild).mockRejectedValueOnce(new ApiError(503, "financial_data_unavailable", [
    { code: "pending_bid_snapshot_missing", playerId: null },
  ]));
  const { result } = renderHook(() => useLineupBuilder("l1", "token"));
  await act(() => result.current.build(preferences));
  expect(result.current.error).toContain("did not return a complete pending-bid list");
  expect(result.current.error).not.toContain("Resolve active bids");
});

it("should resolve diagnostic names when the player catalog arrives after a failure", async () => {
  vi.mocked(streamLineupBuild).mockRejectedValueOnce(new ApiError(503, "mandatory_player_conflict", [
    { code: "player_unavailable", playerId: "master-42" },
  ]));
  const { result, rerender } = renderHook(({ players }) => useLineupBuilder("l1", "token", players), {
    initialProps: { players: new Map<string, { name: string }>() },
  });
  await act(() => result.current.build(preferences));
  expect(result.current.error).toContain("Unknown player: The player is unavailable for the target round.");
  expect(result.current.error).not.toContain("master-42");

  rerender({ players: new Map([["master-42", { name: "Unai Simón" }]]) });
  expect(result.current.error).toContain("Unai Simón: The player is unavailable for the target round.");
});

it("should explain a standings outage without reporting an infeasible lineup", async () => {
  vi.mocked(streamLineupBuild).mockRejectedValueOnce(new ApiError(503, "standings_unavailable", [
    { code: "standings_unavailable", playerId: null },
  ]));
  const { result } = renderHook(() => useLineupBuilder("l1", "token"));
  await act(() => result.current.build(preferences));
  expect(result.current.error).toContain("club standings and recent match history could not be verified");
  expect(result.current.error).toContain("Retry when the standings source is available");
  expect(result.current.error).not.toContain("No lineup satisfies");
});

it("should keep a source outage visible after more than five player exclusions", async () => {
  vi.mocked(streamLineupBuild).mockRejectedValueOnce(new ApiError(409, "no_feasible_lineup", [
    ...Array.from({ length: 6 }, (_, index) => ({
      code: "unsupported_player_position", playerId: String(index),
    })),
    { code: "standings_unavailable", playerId: null },
    { code: "recent_matches_unavailable", playerId: "7" },
  ]));
  const { result } = renderHook(() => useLineupBuilder("l1", "token"));
  await act(() => result.current.build(preferences));
  expect(result.current.error).toContain("club standings source is unavailable or inconsistent");
});
