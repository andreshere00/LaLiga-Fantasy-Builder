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
  linkOptions: { browserAvailable: true, manualAvailable: false, helperAvailable: false, helperPlatforms: [], userId: "alice", email: null, name: null } as LaligaLinkOptions,
  linkOptionsError: false,
  connectLaliga: vi.fn(), reload: vi.fn(), startManualLink: vi.fn(),
  completeManualLink: vi.fn(), cancelManualLink: vi.fn(),
}));
vi.mock("./AuthProvider", () => ({ useAuth: () => auth }));
const tree = () => <StrictMode><MemoryRouter initialEntries={["/connect-laliga"]}><Routes>
  <Route path="/connect-laliga" element={<ConnectLaligaPage />} />
  <Route path="/" element={<p>Connected lineup</p>} />
</Routes></MemoryRouter></StrictMode>;
beforeEach(() => {
  auth.status = "loading"; auth.user = null; auth.accessToken = null; auth.notice = null;
  auth.linkOptions = { browserAvailable: true, manualAvailable: false, helperAvailable: false, helperPlatforms: [], userId: "alice", email: null, name: null };
  auth.linkOptionsError = false;
  auth.connectLaliga.mockReset(); auth.reload.mockReset();
  auth.startManualLink.mockReset(); auth.completeManualLink.mockReset(); auth.cancelManualLink.mockReset();
});

afterEach(cleanup);

// ---- Happy path ---- //
it("starts browser linking only after the user selects it", async () => {
  const view = render(tree());
  expect(auth.connectLaliga).not.toHaveBeenCalled();
  auth.status = "unlinked"; auth.user = { userId: "alice" };
  view.rerender(tree());
  expect(auth.connectLaliga).not.toHaveBeenCalled();
  auth.accessToken = "application-token";
  view.rerender(tree());
  expect(auth.connectLaliga).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Continue to LaLiga" }));
  expect(auth.connectLaliga).toHaveBeenCalledOnce();
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
  expect(auth.connectLaliga).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Continue to LaLiga" }));
  expect(auth.connectLaliga).toHaveBeenCalledOnce();
});

it("shows a failed handoff and lets the user retry", () => {
  auth.status = "unlinked"; auth.user = { userId: "alice" }; auth.accessToken = "application-token";
  const view = render(tree());
  auth.notice = "LaLiga sign-in could not start. Try again.";
  view.rerender(tree());
  expect(screen.getByRole("alert").textContent).toContain("LaLiga sign-in could not start");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(auth.connectLaliga).toHaveBeenCalledOnce();
});

it("rechecks an unavailable connection and offers authorization after recovery", async () => {
  auth.status = "unavailable"; auth.user = { userId: "alice" }; auth.accessToken = "application-token";
  const view = render(tree());
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(auth.reload).toHaveBeenCalledOnce();
  auth.status = "unlinked";
  view.rerender(tree());
  expect(auth.connectLaliga).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Continue to LaLiga" }));
  expect(auth.connectLaliga).toHaveBeenCalledOnce();
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
  auth.linkOptions = { browserAvailable: false, manualAvailable: false, helperAvailable: true, helperPlatforms: ["macos"], userId: "alice", email: null, name: null };
  render(tree());
  expect(auth.connectLaliga).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
  await waitFor(() => expect(auth.reload).toHaveBeenCalledOnce());
});

it("offers browser and manual linking alongside the helper", () => {
  auth.status = "unlinked"; auth.user = { userId: "alice" }; auth.accessToken = "application-token";
  auth.linkOptions = { browserAvailable: true, manualAvailable: true, helperAvailable: true,
    helperPlatforms: ["macos"], userId: "alice", email: null, name: null };
  render(tree());
  expect(screen.getByRole("heading", { name: "Connect with the Mac helper" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Start LaLiga sign-in" })).toBeTruthy();
  expect(auth.connectLaliga).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Continue to LaLiga" }));
  expect(auth.connectLaliga).toHaveBeenCalledOnce();
  expect(auth.startManualLink).not.toHaveBeenCalled();
});

it("starts manual linking only after a click and submits the pasted callback", async () => {
  auth.status = "unlinked"; auth.user = { userId: "alice" }; auth.accessToken = "application-token";
  auth.linkOptions = { browserAvailable: false, manualAvailable: true, helperAvailable: false,
    helperPlatforms: [], userId: "alice", email: null, name: null };
  const tab = { opener: window as Window | null, location: { href: "" }, close: vi.fn() };
  const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
  auth.startManualLink.mockResolvedValue({ authorizeUrl: "https://login.laliga.es/authorize",
    expiresAt: Math.floor(Date.now() / 1000) + 600 });
  auth.completeManualLink.mockResolvedValue(true);
  render(tree());
  expect(auth.startManualLink).not.toHaveBeenCalled();
  expect(auth.connectLaliga).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Start LaLiga sign-in" }));
  await screen.findByLabelText("LaLiga return URL");
  expect(open).toHaveBeenCalledWith("", "_blank");
  expect(tab.opener).toBeNull();
  expect(tab.location.href).toBe("https://login.laliga.es/authorize");
  const callback = "authredirect://com.lfp.laligafantasy?code=secret&state=valid";
  fireEvent.change(screen.getByLabelText("LaLiga return URL"), { target: { value: callback } });
  fireEvent.click(screen.getByRole("button", { name: "Complete connection" }));
  await waitFor(() => expect(auth.completeManualLink).toHaveBeenCalledWith(callback));
  expect(tab.close).not.toHaveBeenCalled();
  open.mockRestore();
});

it("discards a pending manual callback when the application account changes", async () => {
  auth.status = "unlinked"; auth.user = { userId: "alice" }; auth.accessToken = "application-token";
  auth.linkOptions = { browserAvailable: false, manualAvailable: true, helperAvailable: false,
    helperPlatforms: [], userId: "alice", email: null, name: null };
  const open = vi.spyOn(window, "open").mockReturnValue({ opener: null,
    location: { href: "" }, close: vi.fn() } as unknown as Window);
  auth.startManualLink.mockResolvedValue({ authorizeUrl: "https://login.laliga.es/authorize",
    expiresAt: Math.floor(Date.now() / 1000) + 600 });
  const view = render(tree());
  fireEvent.click(screen.getByRole("button", { name: "Start LaLiga sign-in" }));
  await screen.findByLabelText("LaLiga return URL");
  auth.user = { userId: "bob" };
  view.rerender(tree());
  await waitFor(() => expect(screen.queryByLabelText("LaLiga return URL")).toBeNull());
  expect(auth.completeManualLink).not.toHaveBeenCalled();
  open.mockRestore();
});

it("shows an honest unavailable state when no method is enabled", () => {
  auth.status = "unlinked"; auth.user = { userId: "alice" }; auth.accessToken = "application-token";
  auth.linkOptions = { browserAvailable: false, manualAvailable: false, helperAvailable: false, helperPlatforms: [], userId: "alice", email: null, name: null };
  render(tree());
  expect(screen.getByText(/linking is not available/)).toBeTruthy();
  expect(auth.connectLaliga).not.toHaveBeenCalled();
});
