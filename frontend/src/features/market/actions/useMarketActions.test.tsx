// ---- Mocks, fixtures & helpers ---- //
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../api/errors";
import type { MarketRow } from "../model/row";
import { useMarketActions } from "./useMarketActions";

vi.mock("../../../auth/AuthProvider", () => ({ useAuth: () => ({ accessToken: "token", markNeedsReauth: vi.fn() }) }));
vi.mock("../../lineup/LeagueProvider", () => ({ useLeague: () => ({ selected: { id: "lg", team: { id: "t" } } }) }));
const row: MarketRow = {
  id: "m", marketId: "m", playerId: "7", playerTeamId: "pt", name: "Player", positionId: 1,
  photoUrl: null, teamBadgeUrl: null, teamName: null, points: null, form: null, formRecent: [],
  formRecentWeeks: [], averagePoints: null, marketValue: 1, variation: null, variationPercent: null,
  availability: "available", expiresAt: null, seller: "Me", sellerTeamId: "t", sellerKind: "self",
  buyoutClause: 1, clauseUnlockAt: null, isShielded: false, myBid: null, directOffer: false, valueHistory: [],
};
afterEach(() => vi.unstubAllGlobals());
// ---- Error paths ---- //
describe("market mutation reconciliation", () => {
  it.each(["clause", "bid", "offer", "modify"] as const)(
    "invalidates recommendations and refreshes an uncertain %s without retry",
    async (kind) => {
      const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      vi.stubGlobal("fetch", fetchFn);
      const acquisitionChanged = vi.fn();
      const client = new QueryClient({ defaultOptions: { mutations: { retry: 3 } } });
      const refetch = vi.spyOn(client, "refetchQueries").mockResolvedValue();
      const { result, unmount } = renderHook(() => useMarketActions(acquisitionChanged), {
        wrapper: ({ children }: { children: ReactNode }) =>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>,
      });
      act(() => {
        if (kind === "clause") result.current.openClause(row, 1);
        else result.current.openBid({
          ...row,
          sellerKind: kind === "offer" ? "opponent" : "laliga",
          directOffer: kind === "offer",
          myBid: kind === "modify" ? { id: "existing-bid", money: 1 } : null,
        }, kind === "modify" ? "modify" : kind === "offer" ? "purchase" : "hire");
      });
      act(() => {
        if (kind === "clause") result.current.confirmClause();
        else result.current.submitBid(1);
      });
      await waitFor(() => expect(acquisitionChanged).toHaveBeenCalledTimes(1));
      expect(refetch).toHaveBeenCalledWith({ queryKey: ["market", "lg"] });
      expect(refetch).toHaveBeenCalledWith({ queryKey: ["team-money", "lg", "t"] });
      expect(refetch).toHaveBeenCalledWith({ queryKey: ["team", "lg", "t"] });
      expect(fetchFn).toHaveBeenCalledTimes(1);
      unmount();
    },
  );

  it.each([
    new DOMException("The response timed out", "TimeoutError"),
    new ApiError(502, "upstream_error"),
    new ApiError(400, "insufficient_balance"),
  ])("reconciles uncertain clause errors but preserves confirmed rejections: %s", async (error) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    const acquisitionChanged = vi.fn();
    const client = new QueryClient();
    const refetch = vi.spyOn(client, "refetchQueries").mockResolvedValue();
    const { result, unmount } = renderHook(() => useMarketActions(acquisitionChanged), {
      wrapper: ({ children }: { children: ReactNode }) =>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    act(() => result.current.openClause(row, 1));
    act(() => result.current.confirmClause());
    await waitFor(() => expect(result.current.message).not.toBeNull());
    const uncertain = !(error instanceof ApiError) || error.status >= 500;
    expect(acquisitionChanged).toHaveBeenCalledTimes(uncertain ? 1 : 0);
    if (uncertain) {
      expect(refetch).toHaveBeenCalledWith({ queryKey: ["market", "lg"] });
      expect(refetch).toHaveBeenCalledWith({ queryKey: ["team-money", "lg", "t"] });
      expect(refetch).toHaveBeenCalledWith({ queryKey: ["team", "lg", "t"] });
    } else {
      expect(refetch).not.toHaveBeenCalled();
    }
    unmount();
  });

  it.each(["clause", "withdraw"] as const)("refreshes an uncertain %s without retry", async (kind) => {
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"unrelated":true}', { status: 200 })));
    vi.stubGlobal("fetch", fetchFn);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: 3 } } });
    const refetch = vi.spyOn(client, "refetchQueries").mockResolvedValue();
    const { result, unmount } = renderHook(() => useMarketActions(), { wrapper: ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    act(() => {
      if (kind === "clause") result.current.openClause(row, 1);
      else result.current.openWithdraw(row);
    });
    act(() => {
      if (kind === "clause") result.current.confirmClause();
      else result.current.confirmWithdraw();
    });
    await waitFor(() => expect(refetch).toHaveBeenCalledWith({ queryKey: ["market", "lg"] }));
    expect(refetch).toHaveBeenCalledWith({ queryKey: ["team-money", "lg", "t"] });
    expect(refetch).toHaveBeenCalledWith({ queryKey: ["team", "lg", "t"] });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    unmount();
  });
});
