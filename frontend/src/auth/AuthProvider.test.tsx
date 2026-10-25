// ---- Mocks, fixtures & helpers ---- //
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthProvider";

const identity = vi.hoisted(() => ({
  session: { data: null as null | { user: { id: string; email: string; name: string }; session: { id: string } }, isPending: false, refetch: vi.fn() },
  token: vi.fn(), signOut: vi.fn(),
}));
vi.mock("./auth-client", () => ({ authClient: {
  useSession: () => identity.session, token: identity.token, signOut: identity.signOut,
} }));
function login(id: string) {
  identity.session = { ...identity.session, data: { user: { id, email: `${id}@example.test`, name: id }, session: { id: `session-${id}` } }, isPending: false };
}
let tokenIssuedAt: number;
function token(id: string) {
  const iat = tokenIssuedAt;
  return `header.${btoa(JSON.stringify({ sub: id, iat, exp: iat + 900 }))}.signature`;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function Probe() {
  const auth = useAuth();
  return <><output data-testid="state">{JSON.stringify({ status: auth.status, user: auth.user?.userId, token: auth.accessToken })}</output><button onClick={() => { void auth.logout(); }}>Log out</button></>;
}
function mount() {
  const cache = new QueryClient();
  const tree = <QueryClientProvider client={cache}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>;
  const view = render(tree);
  return { cache, rerender: () => view.rerender(<QueryClientProvider client={cache}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>) };
}
const fetchMock = vi.fn();
beforeEach(() => {
  tokenIssuedAt = Math.floor(Date.now() / 1000);
  login("alice");
  identity.token.mockReset().mockImplementation(async () => ({ data: { token: token(identity.session.data!.user.id) }, error: null }));
  identity.signOut.mockReset().mockResolvedValue({ error: null });
  fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ linked: false, needs_reauth: false }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ---- Edge cases ---- //
it("rejects a late token from the previous account and removes its cached data", async () => {
  const old = deferred<{ data: { token: string }; error: null }>();
  identity.token.mockImplementationOnce(() => old.promise);
  const view = mount();
  view.cache.setQueryData(["private", "alice"], { secret: "old account data" });
  login("bob");
  view.rerender();
  await waitFor(() => expect(screen.getByTestId("state").textContent).toContain(token("bob")));
  await act(async () => old.resolve({ data: { token: token("alice") }, error: null }));
  expect(screen.getByTestId("state").textContent).not.toContain(token("alice"));
  expect(view.cache.getQueryData(["private", "alice"])).toBeUndefined();
  expect(fetchMock.mock.calls.every(([, options]) => options.headers.Authorization === `Bearer ${token("bob")}`)).toBe(true);
});

it("clears tokens immediately and cannot reacquire them while logout changes session state", async () => {
  const cancellation = deferred<Response>();
  const view = mount();
  await waitFor(() => expect(screen.getByTestId("state").textContent).toContain(token("alice")));
  view.cache.setQueryData(["private"], { secret: true });
  fetchMock.mockImplementationOnce(() => cancellation.promise);
  fireEvent.click(screen.getByRole("button", { name: "Log out" }));
  expect(screen.getByTestId("state").textContent).not.toContain(token("alice"));
  expect(view.cache.getQueryData(["private"])).toBeUndefined();
  identity.session = { ...identity.session, isPending: true };
  view.rerender();
  identity.session = { ...identity.session, isPending: false };
  view.rerender();
  await act(async () => cancellation.resolve(new Response('{"ok":true}')));
  await waitFor(() => expect(identity.signOut).toHaveBeenCalledOnce());
  expect(identity.token).toHaveBeenCalledOnce();
  expect(screen.getByTestId("state").textContent).toContain("signed-out");
});

it("signs out even when pairing cancellation fails", async () => {
  mount();
  await waitFor(() => expect(screen.getByTestId("state").textContent).toContain(token("alice")));
  fetchMock.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  fireEvent.click(screen.getByRole("button", { name: "Log out" }));
  await waitFor(() => expect(screen.getByTestId("state").textContent).toContain("signed-out"));
  expect(identity.signOut).toHaveBeenCalledOnce();
  expect(identity.token).toHaveBeenCalledOnce();
});

it("clears the token and queries when another tab ends the session", async () => {
  const view = mount();
  await waitFor(() => expect(screen.getByTestId("state").textContent).toContain(token("alice")));
  view.cache.setQueryData(["private"], "alice data");
  identity.session = { ...identity.session, data: null };
  view.rerender();
  await waitFor(() => expect(screen.getByTestId("state").textContent).toContain("signed-out"));
  expect(screen.getByTestId("state").textContent).not.toContain(token("alice"));
  expect(view.cache.getQueryData(["private"])).toBeUndefined();
});

it("does not sign out a new account while the previous account's cancellation finishes", async () => {
  const cancellation = deferred<Response>();
  const view = mount();
  await waitFor(() => expect(screen.getByTestId("state").textContent).toContain(token("alice")));
  fetchMock.mockImplementationOnce(() => cancellation.promise);
  fireEvent.click(screen.getByRole("button", { name: "Log out" }));
  login("bob");
  view.rerender();
  await waitFor(() => expect(screen.getByTestId("state").textContent).toContain(token("bob")));
  await act(async () => cancellation.resolve(new Response('{"ok":true}')));
  expect(identity.signOut).not.toHaveBeenCalled();
  expect(screen.getByTestId("state").textContent).toContain(token("bob"));
});
