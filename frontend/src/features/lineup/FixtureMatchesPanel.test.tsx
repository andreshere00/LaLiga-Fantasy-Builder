// ---- Mocks, fixtures & helpers ---- //
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FixtureMatchesPanel } from "./FixtureMatchesPanel";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ accessToken: "app-jwt", user: { userId: "user-a" } }) }));
let client: QueryClient;
let complete: boolean;
let failed: boolean;
let nextFailed: boolean;
let weatherFailed: boolean;
let weatherOptionalFailure: boolean;
let requests: string[];
const rows = (week: number, state: number) => Array.from({ length: 10 }, (_, index) => ({
  id: `${week}-${index}`, localId: index * 2 + 1, visitorId: index * 2 + 2, matchState: state,
  matchDate: state === 7 ? "2026-10-18T18:00:00+02:00" : "2026-10-24T18:00:00+02:00", localScore: 0, visitorScore: 0,
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  complete = false; failed = false; nextFailed = false; weatherFailed = false; weatherOptionalFailure = false; requests = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    requests.push(path);
    if (failed || (nextFailed && path === "/api/calendar/weeks/11")) return Response.json({ error: "unavailable" }, { status: 503 });
    if (path === "/api/calendar/current") return Response.json({ weekNumber: 10, previousWeek: 9, nextWeek: 11, isLive: false });
    if (path.endsWith("/weather")) {
      if (weatherFailed) return Response.json({ error: "unavailable" }, { status: 503 });
      const week = Number(path.split("/")[4]);
      return Response.json({ weekNumber: week, generatedAt: "2026-10-20T12:00:00Z", matches: [{
        fixtureId: `${week}-0`, localId: 1, visitorId: 2, kickoff: "2026-10-24T16:00:00Z",
        fetchedAt: "2026-10-20T11:00:00Z", weather: weatherOptionalFailure ? { snapshot: null, reason: "provider_unavailable" } : { snapshot: { temperatureC: 0, condition: "clear", conditionCode: 800,
          windSpeedMs: 0, precipitationProbability: 0, forecastFor: "2026-10-24T15:00:00Z" } },
      }] });
    }
    const week = Number(path.split("/")[4]);
    return Response.json(rows(week, week === 9 || (week === 10 && complete) ? 7 : 1));
  }));
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function mount() { return render(<QueryClientProvider client={client}><FixtureMatchesPanel /></QueryClientProvider>); }

// ---- Happy path ---- //
describe("FixtureMatchesPanel", () => {
  it("shows upcoming pairings and zero-valued forecasts independently of lineup queries", async () => {
    mount();
    await screen.findByText("Forecast 0°C · Clear");
    expect(screen.getByText("Rain 0% · Wind 0 km/h")).toBeTruthy();
    expect(screen.getByText("Up next")).toBeTruthy();
    expect(screen.getByText(/Europe\/Madrid/)).toBeTruthy();
    expect(requests.some((path) => path.includes("/stats"))).toBe(false);
    expect(screen.getAllByLabelText("Home goals: no result")).toHaveLength(10);
  });

  it("rolls over after the final match without a reload or metadata change", async () => {
    mount(); await screen.findByText("Up next");
    complete = true;
    await act(() => client.invalidateQueries({ queryKey: ["calendar"] }));
    await screen.findByRole("heading", { name: "LALIGA · Fixture 11" });
    expect(requests).toContain("/api/calendar/weeks/11");
    expect(screen.getByText("Up next")).toBeTruthy();
  });

  it("browses adjacent fixtures independently with only previous and next controls", async () => {
    mount(); await screen.findByText("Up next");
    expect(screen.queryByRole("button", { name: "Refresh fixture matches" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Previous matchweek" }));
    await screen.findByRole("heading", { name: "LALIGA · Fixture 9" });
    expect(screen.getAllByText("Finished")).toHaveLength(11);
    fireEvent.click(screen.getByRole("button", { name: "Next matchweek" }));
    await screen.findByRole("heading", { name: "LALIGA · Fixture 10" });
    fireEvent.click(screen.getByRole("button", { name: "Next matchweek" }));
    await screen.findByRole("heading", { name: "LALIGA · Fixture 11" });
    await waitFor(() => expect(requests).toContain("/api/calendar/weeks/11/weather"));
    expect(screen.queryByRole("button", { name: "Current fixture" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Match scrolling" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Previous matchweek" }));
    await screen.findByRole("heading", { name: "LALIGA · Fixture 10" });
  });

  it("bounds browsing to the season and preserves a manually selected completed fixture", async () => {
    mount(); await screen.findByText("Up next");
    for (let week = 9; week >= 1; week--) {
      fireEvent.click(screen.getByRole("button", { name: "Previous matchweek" }));
      await screen.findByRole("heading", { name: `LALIGA · Fixture ${week}` });
    }
    expect((screen.getByRole("button", { name: "Previous matchweek" }) as HTMLButtonElement).disabled).toBe(true);
    complete = true;
    await act(() => client.invalidateQueries({ queryKey: ["calendar"] }));
    expect(screen.getByRole("heading", { name: "LALIGA · Fixture 1" })).toBeTruthy();
    for (let week = 2; week <= 38; week++) {
      fireEvent.click(screen.getByRole("button", { name: "Next matchweek" }));
      await screen.findByRole("heading", { name: `LALIGA · Fixture ${week}` });
    }
    expect((screen.getByRole("button", { name: "Next matchweek" }) as HTMLButtonElement).disabled).toBe(true);
    expect(requests).not.toContain("/api/calendar/weeks/0");
    expect(requests).not.toContain("/api/calendar/weeks/39");
  });

  // ---- Error paths ---- //
  it("retains completed results and offers retry if the next schedule fails", async () => {
    complete = true; nextFailed = true; mount();
    await screen.findByText("Next fixture unavailable. Retrying automatically.");
    expect(screen.getByRole("heading", { name: "LALIGA · Fixture 10" })).toBeTruthy();
    expect(screen.getAllByLabelText("Home goals: 0")).toHaveLength(10);
    nextFailed = false;
    await act(() => client.invalidateQueries({ queryKey: ["calendar"] }));
    await screen.findByRole("heading", { name: "LALIGA · Fixture 11" });
  });

  it("retries a failed browsed fixture without switching back to the automatic week", async () => {
    mount(); await screen.findByText("Up next");
    nextFailed = true;
    fireEvent.click(screen.getByRole("button", { name: "Next matchweek" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("heading", { name: "LALIGA · Fixture 11" })).toBeTruthy();
    nextFailed = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry fixture matches" }));
    await screen.findByText("Forecast 0°C · Clear");
    expect(screen.getByRole("heading", { name: "LALIGA · Fixture 11" })).toBeTruthy();
  });

  it("shows matches when optional weather fails", async () => {
    weatherFailed = true; mount();
    expect(await screen.findAllByText("Forecast unavailable")).toHaveLength(10);
    expect(screen.getAllByLabelText("Home goals: no result")).toHaveLength(10);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("retains an honestly labeled forecast when one venue fails inside an HTTP 200 aggregate", async () => {
    mount(); await screen.findByText("Forecast 0°C · Clear");
    weatherOptionalFailure = true;
    await act(() => client.invalidateQueries({ queryKey: ["calendar"] }));
    await screen.findByText(/Update unavailable ·/);
    expect(screen.getByText("Forecast 0°C · Clear")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers retry after initial calendar failure and preserves rows on refresh failure", async () => {
    failed = true; mount();
    await screen.findByRole("alert");
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry fixture matches" }));
    await screen.findByText("Up next");
    const navigation = screen.getByRole("button", { name: "Next matchweek" });
    navigation.focus(); failed = true;
    await act(() => client.invalidateQueries({ queryKey: ["calendar"] }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("previously retrieved"));
    expect(screen.getAllByLabelText("Home goals: no result")).toHaveLength(10);
    expect(document.activeElement).toBe(navigation);
  });
});
