// ---- Mocks, fixtures & helpers ---- //
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiContractError } from "../../api/errors";
import { useSquadSales } from "./useSquadSales";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ accessToken: "token", markNeedsReauth: vi.fn() }) }));
vi.mock("./LeagueProvider", () => ({ useLeague: () => ({ selected: { id: "lg" } }) }));
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 3 } } });
  const refetch = vi.spyOn(client, "refetchQueries").mockResolvedValue();
  const hook = renderHook(() => useSquadSales(), { wrapper: ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  return { ...hook, refetch };
}
afterEach(() => vi.unstubAllGlobals());
// ---- Error paths ---- //
describe("squad sales validation and reconciliation", () => {
  it.each([{ playerTeamId: "pt", marketId: "m", salePrice: 0 }, { playerTeamId: "", marketId: "m", salePrice: 1 }, { playerTeamId: "pt", marketId: "", salePrice: 1 }])
    ("validates complete replacement before deleting $playerTeamId", async (input) => {
      const fetchFn = vi.fn(); vi.stubGlobal("fetch", fetchFn);
      const { result } = setup();
      await act(async () => { await expect(result.current.modifyListing.mutateAsync(input)).rejects.toThrow(); });
      expect(fetchFn).not.toHaveBeenCalled();
    });
  it.each(["listPlayer", "cancelListing", "sellImmediately"] as const)("refreshes after uncertain %s without retry", async (mutation) => {
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"unrelated":true}', { status: 200 })));
    vi.stubGlobal("fetch", fetchFn);
    const { result, refetch } = setup();
    await act(async () => {
      const request = mutation === "listPlayer" ? result.current.listPlayer.mutateAsync({ playerTeamId: "pt", salePrice: 1 })
        : mutation === "cancelListing" ? result.current.cancelListing.mutateAsync("m")
        : result.current.sellImmediately.mutateAsync("pt");
      await expect(request).rejects.toBeInstanceOf(ApiContractError);
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(5);
  });
  it("refreshes when replacement POST has an invalid response", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"unrelated":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchFn);
    const { result, refetch } = setup();
    await act(async () => { await expect(result.current.modifyListing.mutateAsync({ playerTeamId: "pt", marketId: "m", salePrice: 1 })).rejects.toThrow(); });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(refetch).toHaveBeenCalledTimes(5);
  });
});
