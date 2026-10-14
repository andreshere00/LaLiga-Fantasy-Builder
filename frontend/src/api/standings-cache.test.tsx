// ---- Mocks, fixtures & helpers ---- //
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompetitionStandingsQuery } from "./queries";

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  auth: { accessToken: "token" as string | null, user: { userId: "user-a" } as { userId: string } | null },
}));
vi.mock("./client", async (original) => ({ ...await original<typeof import("./client")>(), getJson: mocks.getJson }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => mocks.auth }));
const payload = JSON.parse(readFileSync(resolve(process.cwd(), "../contracts/standings-response.json"), "utf8")).payload;
let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function mount() {
  return renderHook(() => useCompetitionStandingsQuery(1, 2026), { wrapper: Wrapper });
}
async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
  mocks.auth.accessToken = "token";
  mocks.auth.user = { userId: "user-a" };
  mocks.getJson.mockReset().mockResolvedValue(payload);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
});

// ---- Happy path ---- //
describe("standings session caching", () => {
  it("should reuse cached data when returning after 59 minutes away", async () => {
    const first = mount();
    await settle();
    expect(first.result.current.isSuccess).toBe(true);
    first.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(59 * 60_000); });
    const second = mount();
    await settle();
    expect(second.result.current.data).toEqual(payload);
    expect(mocks.getJson).toHaveBeenCalledTimes(1);
  });
  it("should reuse fresh data when the JWT rotates or the window regains focus", async () => {
    const hook = mount();
    await settle();
    mocks.auth.accessToken = "rotated-token";
    hook.rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60_000);
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await settle();
    expect(mocks.getJson).toHaveBeenCalledTimes(1);
    expect(hook.result.current.data).toEqual(payload);
  });

  // ---- Edge cases ---- //
  it("should refresh with the latest JWT when data becomes stale after one hour", async () => {
    const hook = mount();
    await settle();
    mocks.auth.accessToken = "rotated-token";
    hook.rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60_000);
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await settle();
    expect(mocks.getJson).toHaveBeenCalledTimes(2);
    expect(mocks.getJson.mock.calls[1][1]).toBe("rotated-token");
  });
  it("should fetch independently when the signed-in user changes", async () => {
    const hook = mount();
    await settle();
    mocks.auth.user = { userId: "user-b" };
    hook.rerender();
    await settle();
    expect(mocks.getJson).toHaveBeenCalledTimes(2);
  });

  // ---- Error paths ---- //
  it("should avoid fetching when the user session is absent", async () => {
    mocks.auth.accessToken = null;
    mocks.auth.user = null;
    mount();
    await settle();
    expect(mocks.getJson).not.toHaveBeenCalled();
  });
});
