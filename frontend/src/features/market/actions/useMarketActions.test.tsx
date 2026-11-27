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
const renderActions = (client: QueryClient) => renderHook(() => useMarketActions(), {
  wrapper: ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>,
});
const bidRow: MarketRow = { ...row, sellerKind: "laliga", myBid: { id: "bid-1", money: 5 }, expiresAt: Date.now() + 60_000 };

// ---- Happy path ---- //
describe("cancel bid confirmation", () => {
  it("openCancelBid_beforeConfirmation_sendsNoRequest", () => {
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    const { result, unmount } = renderActions(new QueryClient());

    act(() => result.current.openCancelBid(bidRow));

    expect(result.current.pendingCancelBid).toBe(bidRow);
    expect(fetchFn).not.toHaveBeenCalled();
    act(() => result.current.closeCancelBid());
    expect(result.current.pendingCancelBid).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    unmount();
  });

  it("confirmCancelBid_afterOpening_deletesBidAndClosesDialog", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchFn);
    const client = new QueryClient();
    vi.spyOn(client, "refetchQueries").mockResolvedValue();
    const { result, unmount } = renderActions(client);

    act(() => result.current.openCancelBid(bidRow));
    act(() => result.current.confirmCancelBid());

    await waitFor(() => expect(result.current.pendingCancelBid).toBeNull());
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toContain("bid-1");
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
    unmount();
  });
});

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
