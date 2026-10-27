// ---- Mocks, fixtures & helpers ---- //
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AuthStatus, LaligaLinkOptions } from "./types";
import { ConnectLaligaPage } from "./ConnectLaligaPage";

const auth = vi.hoisted(() => ({
  status: "loading" as AuthStatus,
  user: null as null | { userId: string },
  accessToken: null as string | null,
  notice: null as string | null,
  linkOptions: { browserAvailable: true, helperAvailable: false, helperPlatforms: [], userId: "alice", email: null, name: null } as LaligaLinkOptions,
  linkOptionsError: false,
  connectLaliga: vi.fn(), reload: vi.fn(),
}));
vi.mock("./AuthProvider", () => ({ useAuth: () => auth }));
const tree = () => <StrictMode><MemoryRouter initialEntries={["/connect-laliga"]}><Routes>
  <Route path="/connect-laliga" element={<ConnectLaligaPage />} />
  <Route path="/" element={<p>Connected lineup</p>} />
</Routes></MemoryRouter></StrictMode>;
beforeEach(() => {
  auth.status = "loading"; auth.user = null; auth.accessToken = null; auth.notice = null;
  auth.linkOptions = { browserAvailable: true, helperAvailable: false, helperPlatforms: [], userId: "alice", email: null, name: null };
  auth.linkOptionsError = false;
  auth.connectLaliga.mockReset(); auth.reload.mockReset();
});

afterEach(cleanup);

// ---- Happy path ---- //
it("starts LaLiga once after session and application token are ready", async () => {
  const view = render(tree());
  expect(auth.connectLaliga).not.toHaveBeenCalled();
  auth.status = "unlinked"; auth.user = { userId: "alice" };
  view.rerender(tree());
  expect(auth.connectLaliga).not.toHaveBeenCalled();
  auth.accessToken = "application-token";
  view.rerender(tree());
  await waitFor(() => expect(auth.connectLaliga).toHaveBeenCalledOnce());
  view.rerender(tree());
  expect(auth.connectLaliga).toHaveBeenCalledOnce();
});

it("returns an already connected user to the lineup", async () => {
  auth.status = "ready"; auth.user = { userId: "alice" };
  render(tree());
  await screen.findByText("Connected lineup");
  expect(auth.connectLaliga).not.toHaveBeenCalled();
});

// ---- Error paths ---- //
it("shows a returned callback error without automatically starting another authorization", () => {
  auth.status = "unlinked"; auth.user = { userId: "alice" }; auth.accessToken = "application-token";
  render(<StrictMode><MemoryRouter initialEntries={["/connect-laliga?error=laliga_link_failed"]}><Routes>
    <Route path="/connect-laliga" element={<ConnectLaligaPage />} />
  </Routes></MemoryRouter></StrictMode>);
  expect(screen.getByRole("alert").textContent).toContain("could not be completed");
  expect(auth.connectLaliga).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(auth.connectLaliga).toHaveBeenCalledOnce();
});

it("shows a failed handoff and lets the user retry", () => {
  auth.status = "unlinked"; auth.user = { userId: "alice" }; auth.accessToken = "application-token";
  const view = render(tree());
  auth.notice = "LaLiga sign-in could not start. Try again.";
  view.rerender(tree());
  expect(screen.getByRole("alert").textContent).toContain("LaLiga sign-in could not start");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(auth.connectLaliga).toHaveBeenCalledTimes(2);
});

it("rechecks an unavailable connection and starts authorization after recovery", async () => {
  auth.status = "unavailable"; auth.user = { userId: "alice" }; auth.accessToken = "application-token";
  const view = render(tree());
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(auth.reload).toHaveBeenCalledOnce();
  auth.status = "unlinked";
  view.rerender(tree());
  await waitFor(() => expect(auth.connectLaliga).toHaveBeenCalledOnce());
});

// ---- Edge cases ---- //
it("requires application sign-in when opened without a session", () => {
  auth.status = "signed-out";
  render(tree());
  expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
  expect(auth.connectLaliga).not.toHaveBeenCalled();
});

it("shows helper instructions and checks the connection without browser login", async () => {
  auth.status = "unlinked"; auth.user = { userId: "alice" }; auth.accessToken = "application-token";
  auth.linkOptions = { browserAvailable: false, helperAvailable: true, helperPlatforms: ["macos"], userId: "alice", email: null, name: null };
  render(tree());
  expect(auth.connectLaliga).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
  await waitFor(() => expect(auth.reload).toHaveBeenCalledOnce());
});

it("shows an honest unavailable state when no method is enabled", () => {
  auth.status = "unlinked"; auth.user = { userId: "alice" }; auth.accessToken = "application-token";
  auth.linkOptions = { browserAvailable: false, helperAvailable: false, helperPlatforms: [], userId: "alice", email: null, name: null };
  render(tree());
  expect(screen.getByText(/linking is not available/)).toBeTruthy();
  expect(auth.connectLaliga).not.toHaveBeenCalled();
});
