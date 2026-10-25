import { beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "./auth-client";
import { AuthClient, refreshDelayMs, startLogin, tokenMetadata } from "./client";
import { MemoryTokenStore } from "./tokenStore";
vi.mock("./auth-client", () => ({ authClient: { token: vi.fn() } }));
const issued = (sub = "alice", delta = 900) => {
  const iat = Math.floor(Date.now() / 1000);
  return `header.${btoa(JSON.stringify({ sub, iat, exp: iat + delta }))}.signature`;
};
beforeEach(() => vi.clearAllMocks());
describe("Better Auth application tokens", () => {
  it("uses the application sign-in screen", () => {
    const navigate = vi.fn(); startLogin(navigate); expect(navigate).toHaveBeenCalledWith("/sign-in");
  });
  it("stores only a matching account token in memory", async () => {
    const token = issued();
    vi.mocked(authClient.token).mockResolvedValue({ data: { token }, error: null });
    const store = new MemoryTokenStore();
    const client = new AuthClient(vi.fn(), store);
    const persist = vi.spyOn(Storage.prototype, "setItem");
    await client.exchange("alice");
    expect(store.get()).toBe(token); expect(persist).not.toHaveBeenCalled();
    client.clearToken(); expect(store.get()).toBeNull(); persist.mockRestore();
  });
  it("rejects a token for a different account", async () => {
    vi.mocked(authClient.token).mockResolvedValue({ data: { token: issued("bob") }, error: null });
    const store = new MemoryTokenStore();
    await expect(new AuthClient(vi.fn(), store).exchange("alice")).rejects.toThrow();
    expect(store.get()).toBeNull();
  });
  it("does not restore tokens from aborted work", async () => {
    const controller = new AbortController(); controller.abort();
    vi.mocked(authClient.token).mockResolvedValue({ data: { token: issued() }, error: null });
    const store = new MemoryTokenStore();
    await new AuthClient(vi.fn(), store).exchange("alice", { signal: controller.signal });
    expect(store.get()).toBeNull();
  });
  it("rejects expired and overlong tokens", () => {
    expect(() => tokenMetadata(issued("alice", -10), "alice")).toThrow();
    expect(() => tokenMetadata(issued("alice", 3600), "alice")).toThrow();
    expect(refreshDelayMs(1000, 900000)).toBe(40000);
    expect(refreshDelayMs(10, 20000)).toBe(1000);
  });
  it("authenticates LaLiga by bearer and validates the redirect host", async () => {
    const store = new MemoryTokenStore(); store.set("application-jwt");
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ authorize_url: "https://evil.test" })));
    const client = new AuthClient(fetch, store);
    await expect(client.startLaligaLogin()).rejects.toThrow("Invalid LaLiga");
    expect(fetch).toHaveBeenCalledWith("/laliga/login", expect.objectContaining({ method: "POST", credentials: "omit", headers: expect.objectContaining({ Authorization: "Bearer application-jwt" }) }));
  });
});
