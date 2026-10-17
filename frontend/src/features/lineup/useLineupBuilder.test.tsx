import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import response from "../../../../contracts/lineup-builder-response.json";
import { lineupBuildResponseSchema, type LineupBuildRequest } from "../../api/schemas";
import { postJson } from "../../api/client";
import { ApiError } from "../../api/errors";
import { useLineupBuilder } from "./useLineupBuilder";

vi.mock("../../api/client", () => ({ paths: { lineupBuild: (id: string) => `/api/lineup-builder/leagues/${id}/build` }, postJson: vi.fn() }));
const preferences: LineupBuildRequest = { sources: ["owned"], mandatoryPlayerIds: [], formations: [], allowBuying: false,
  allowSelling: false, includeTradingPurchases: false, maxCandidates: 5, explanation: { enabled: false } };

beforeEach(() => vi.clearAllMocks());
describe("useLineupBuilder", () => {
  it("should discard a late result after cancellation", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof postJson>>) => void;
    vi.mocked(postJson).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { result } = renderHook(() => useLineupBuilder("l1", "token"));
    let pending!: Promise<void>;
    act(() => { pending = result.current.build(preferences); });
    act(() => result.current.cancel());
    await act(async () => { resolve(lineupBuildResponseSchema.parse(response.payload)); await pending; });
    expect(result.current.result).toBeNull();
    expect(result.current.pending).toBe(false);
  });
  it("should preserve a successful result as stale when refresh fails", async () => {
    vi.mocked(postJson).mockResolvedValueOnce(lineupBuildResponseSchema.parse(response.payload))
      .mockRejectedValueOnce(new ApiError(503, "financial_data_unavailable"));
    const { result } = renderHook(() => useLineupBuilder("l1", "token"));
    await act(() => result.current.build(preferences));
    await act(() => result.current.build(preferences));
    expect(result.current.result?.buildId).toBe("fixture");
    expect(result.current.error).toContain("Cash");
  });
  it("should abort in-flight work when its session scope unmounts", () => {
    vi.mocked(postJson).mockImplementation(() => new Promise(() => {}));
    const { result, unmount } = renderHook(() => useLineupBuilder("l1", "token"));
    act(() => { void result.current.build(preferences); });
    const signal = vi.mocked(postJson).mock.calls[0][3]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});

it("should explain missing bid coverage without asking the user to resolve nonexistent bids", async () => {
  vi.mocked(postJson).mockRejectedValueOnce(new ApiError(503, "financial_data_unavailable", [
    { code: "pending_bid_snapshot_missing", playerId: null },
  ]));
  const { result } = renderHook(() => useLineupBuilder("l1", "token"));
  await act(() => result.current.build(preferences));
  expect(result.current.error).toContain("did not return a complete pending-bid list");
  expect(result.current.error).not.toContain("Resolve active bids");
});

it("should resolve diagnostic names when the player catalog arrives after a failure", async () => {
  vi.mocked(postJson).mockRejectedValueOnce(new ApiError(503, "mandatory_player_conflict", [
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
  vi.mocked(postJson).mockRejectedValueOnce(new ApiError(503, "standings_unavailable", [
    { code: "standings_unavailable", playerId: null },
  ]));
  const { result } = renderHook(() => useLineupBuilder("l1", "token"));
  await act(() => result.current.build(preferences));
  expect(result.current.error).toContain("club standings and recent match history could not be verified");
  expect(result.current.error).toContain("Retry when the standings source is available");
  expect(result.current.error).not.toContain("No lineup satisfies");
});

it("should keep a source outage visible after more than five player exclusions", async () => {
  vi.mocked(postJson).mockRejectedValueOnce(new ApiError(409, "no_feasible_lineup", [
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
