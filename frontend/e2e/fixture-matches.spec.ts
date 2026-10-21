import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { mockApplication } from "./fixtures";

const crests = JSON.parse(readFileSync(resolve(process.cwd(), "e2e/fixtures/club-crests.json"), "utf8")) as Record<string, string>;
const clubs = [4, 15, 3, 2, 5, 17, 16, 20, 18, 28, 6, 13, 9, 33, 8, 14, 21, 7, 11, 19];

async function mockFixtureMatches(page: Page) {
  await mockApplication(page);
  let phase: "upcoming" | "active" | "finished" = "upcoming";
  let weatherFails = false;
  let nextFails = false;
  let fixturesFail = false;
  let postponed = false;
  let advanced = false;
  const calls = { fixtures: new Map<number, number>(), weather: 0, writes: [] as string[] };
  await page.route("https://assets-fantasy.llt-services.com/teambadge/**", (route) => {
    const encoded = crests[route.request().url()];
    return encoded ? route.fulfill({ contentType: "image/png", body: Buffer.from(encoded, "base64") }) : route.abort();
  });
  const fixtureRows = (week: number) => Array.from({ length: 10 }, (_, index) => ({
    id: `${week}-${index}`, localId: clubs[index * 2], visitorId: clubs[index * 2 + 1],
    matchDate: week === 7 ? "2026-10-10T13:00:00Z" : week === 9 ? "2026-10-20T13:00:00Z"
      : index === 9 ? "2026-10-13T18:00:00Z" : "2026-10-13T13:00:00Z",
    matchState: week === 7 || (week === 8 && (phase === "finished" || (phase === "active" && index < 8))) ? 7
      : week === 8 && phase === "active" && index === 8 ? (postponed ? 99 : 2) : 1,
    localScore: phase === "active" && index === 8 ? 2 : 0,
    visitorScore: phase === "active" && index === 8 ? 1 : 0,
  }));
  await page.route("**/api/calendar/current", (route) => route.fulfill({ json: {
    weekNumber: advanced ? 9 : 8, previousWeek: advanced ? 8 : 7, nextWeek: advanced ? 10 : 9, isLive: phase === "active" && !advanced,
    openingWeekDate: "2026-10-13T13:00:00Z",
  } }));
  await page.route(/\/api\/calendar\/weeks\/\d+$/, (route) => {
    const week = Number(new URL(route.request().url()).pathname.split("/")[4]);
    calls.fixtures.set(week, (calls.fixtures.get(week) ?? 0) + 1);
    return fixturesFail || (nextFails && week === 9)
      ? route.fulfill({ status: 503, json: { error: "unavailable", detail: "Fixtures unavailable" } })
      : route.fulfill({ json: fixtureRows(week) });
  });
  await page.route("**/api/calendar/weeks/*/weather", (route) => {
    calls.weather++;
    if (weatherFails) return route.fulfill({ status: 503, json: { error: "unavailable", detail: "Weather unavailable" } });
    const week = Number(new URL(route.request().url()).pathname.split("/")[4]);
    return route.fulfill({ json: {
      weekNumber: week, generatedAt: "2026-10-12T12:00:00Z",
      matches: fixtureRows(week).map((match, index) => ({
        fixtureId: match.id, localId: match.localId, visitorId: match.visitorId, kickoff: match.matchDate,
        fetchedAt: "2026-10-12T11:30:00Z",
        weather: week === 9 ? { reason: "beyond_forecast_horizon" } : match.matchState !== 1 ? { reason: "match_started" } : {
          snapshot: { temperatureC: index === 0 ? 0 : 18, conditionCode: index % 2 ? 500 : 800,
            condition: index % 2 ? "rain" : "clear", windSpeedMs: index === 0 ? 0 : 3,
            precipitationProbability: index % 2 ? .8 : 0, forecastFor: match.matchDate, source: "openweather" },
        },
      })),
    } });
  });
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/") && request.method() !== "GET") calls.writes.push(request.url()); });
  return { calls,
    phase: (value: typeof phase) => { phase = value; },
    weatherFailure: (value: boolean) => { weatherFails = value; },
    nextFailure: (value: boolean) => { nextFails = value; },
    fixturesFailure: (value: boolean) => { fixturesFail = value; },
    postpone: () => { postponed = true; },
    advance: () => { advanced = true; },
  };
}

for (const theme of ["light", "dark"]) {
  for (const width of [320, 375, 800, 1024, 1440]) {
    test(`fixture panel layout and scrolling ${theme} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width >= 1440 ? 1000 : 1100 });
      const api = await mockFixtureMatches(page);
      await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
      await page.goto("/");
      const panel = page.getByRole("region", { name: "LALIGA · Fixture 8", exact: true });
      const viewport = panel.getByRole("region", { name: "Fixture matches", exact: true });
      await expect(panel.getByText("Forecast 0°C · Clear")).toBeVisible();
      await expect(panel.getByText("Rain 0% · Wind 0 km/h")).toBeVisible();
      await expect(panel.getByRole("listitem")).toHaveCount(10);
      const panelBox = await panel.boundingBox();
      const controlsBox = await page.locator(".board-controls-bar").boundingBox();
      expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(controlsBox!.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await expect(panel.getByRole("button", { name: "Refresh fixture matches" })).toHaveCount(0);
      if (width <= 600) {
        const actions = await panel.locator(".fixture-panel-actions").boundingBox();
        expect(Math.abs(actions!.x + actions!.width / 2 - (panelBox!.x + panelBox!.width / 2))).toBeLessThan(2);
        const pager = await panel.getByRole("navigation", { name: "Fixture navigation" }).boundingBox();
        expect(Math.abs(pager!.x + pager!.width / 2 - (panelBox!.x + panelBox!.width / 2))).toBeLessThan(2);
      }
      const forecast = panel.getByRole("region", { name: /^Forecast for/ }).first();
      await forecast.focus();
      await page.keyboard.press("End");
      await expect.poll(() => forecast.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      await page.keyboard.press("Home");
      await panel.getByRole("button", { name: "Scroll to later matches" }).click();
      await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      await viewport.focus(); await page.keyboard.press("End");
      await expect(panel.getByText("Real Valladolid CF", { exact: true })).toBeInViewport();
      await viewport.evaluate((node) => { node.scrollLeft = 0; });
      await expect(panel.getByRole("button", { name: "Scroll to earlier matches" })).toHaveAttribute("aria-disabled", "true");
      expect(api.calls.fixtures.get(8)).toBe(1);
      expect(api.calls.writes).toEqual([]);
      await page.evaluate(() => document.fonts.ready);
      await viewport.evaluate((node) => node.blur());
      await page.mouse.move(0, 0);
      await page.screenshot({ path: info.outputPath(`fixture-panel-${theme}-${width}.png`) });
      if (theme === "light" && (width === 1440 || width === 375)) {
        await page.screenshot({ path: resolve(process.cwd(), `../docs/images/screenshots/lineup-fixtures-${width === 1440 ? "light" : "mobile"}.png`) });
      }
    });
  }
}

test("active scores, saved kickoff forecasts, failed handoff, then next schedule", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const api = await mockFixtureMatches(page);
  await page.addInitScript(() => localStorage.setItem("lfb-theme", "dark"));
  await page.goto("/");
  const panel = page.locator(".fixture-matches-panel");
  await expect(panel.getByText("Forecast 0°C · Clear")).toBeVisible();
  api.phase("active");
  await page.clock.setFixedTime(new Date("2026-10-13T15:00:00Z"));
  await page.clock.runFor(30_010);
  await expect(panel.getByText("In progress", { exact: true })).toBeVisible();
  await expect(panel.getByText("8 of 10 matches finished", { exact: false })).toBeVisible();
  await expect(panel.getByText("Saved kickoff forecast", { exact: true })).toBeVisible();
  const scroll = panel.getByRole("region", { name: "Fixture matches", exact: true });
  await scroll.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
  const offset = await scroll.evaluate((node) => node.scrollLeft);
  const navigation = panel.getByRole("button", { name: "Next matchweek" });
  await navigation.focus(); await page.clock.runFor(30_100);
  expect(await scroll.evaluate((node) => node.scrollLeft)).toBe(offset);
  await expect(navigation).toBeFocused();
  await navigation.evaluate((node) => node.blur());
  await page.mouse.move(0, 0);
  await page.screenshot({ path: resolve(process.cwd(), "../docs/images/screenshots/lineup-fixtures-dark.png") });
  api.nextFailure(true); api.phase("finished"); await page.clock.runFor(30_100);
  await expect(panel.getByText("Next fixture unavailable. Retrying automatically.")).toBeVisible();
  await expect(panel.getByRole("heading", { name: "LALIGA · Fixture 8" })).toBeVisible();
  api.nextFailure(false); await page.clock.runFor(30_100);
  await expect(panel.getByRole("heading", { name: "LALIGA · Fixture 9" })).toBeVisible();
  await expect(panel.getByLabel("Home goals: no result")).toHaveCount(10);
  await expect(panel.getByText("Forecast closer to kickoff", { exact: true })).toHaveCount(10);
  expect(api.calls.writes).toEqual([]);
});

test("weather failure and unknown match states do not block the lineup or falsely complete a round", async ({ page }) => {
  const api = await mockFixtureMatches(page);
  api.weatherFailure(true);
  await page.goto("/");
  const panel = page.locator(".fixture-matches-panel");
  await expect(panel.getByText("Forecast unavailable", { exact: true })).toHaveCount(10);
  await expect(page.getByRole("button", { name: "Lineup builder", exact: true })).toBeVisible();
  api.phase("active"); api.postpone();
  await page.clock.setFixedTime(new Date("2026-10-13T15:00:00Z"));
  await page.clock.runFor(30_100);
  await expect(panel.getByText("In progress", { exact: true })).toBeVisible();
  await expect(panel.getByText("Status unconfirmed")).toHaveCount(1);
  expect(api.calls.fixtures.has(9)).toBe(false);
});

test("visible score polling shares requests, pauses when hidden, and does not poll weather every thirty seconds", async ({ page }) => {
  const api = await mockFixtureMatches(page);
  await page.goto("/");
  await expect(page.locator(".fixture-matches-panel").getByText("Forecast 0°C · Clear")).toBeVisible();
  await page.clock.runFor(30_100);
  await expect.poll(() => api.calls.fixtures.get(8) ?? 0).toBeGreaterThan(1);
  expect(api.calls.fixtures.get(7)).toBe(1);
  expect(api.calls.weather).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    window.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenReads = api.calls.fixtures.get(8);
  await page.clock.runFor(60_100);
  expect(api.calls.fixtures.get(8)).toBe(hiddenReads);
  expect(api.calls.weather).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    window.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(30_100);
  await expect.poll(() => api.calls.fixtures.get(8) ?? 0).toBeGreaterThan(hiddenReads ?? 0);
});

test("an advanced current-week pointer retains completed results when the new schedule fails", async ({ page }) => {
  const api = await mockFixtureMatches(page);
  await page.goto("/");
  const panel = page.locator(".fixture-matches-panel");
  await expect(panel.getByText("Up next", { exact: true })).toBeVisible();
  api.phase("active");
  await page.clock.setFixedTime(new Date("2026-10-13T15:00:00Z"));
  await page.clock.runFor(30_100);
  await expect(panel.getByText("In progress", { exact: true })).toBeVisible();
  api.phase("finished"); api.advance(); api.nextFailure(true);
  await page.clock.runFor(30_100);
  await expect(panel.getByRole("heading", { name: "LALIGA · Fixture 8" })).toBeVisible();
  // The previous round remains visible while its newly mounted observer polls the final result.
  await page.clock.runFor(30_100);
  await expect(panel.getByText("Next fixture unavailable. Retrying automatically.")).toBeVisible();
  await expect(panel.getByRole("heading", { name: "LALIGA · Fixture 8" })).toBeVisible();
  await expect(panel.getByLabel("Home goals: 0")).toHaveCount(10);
  api.nextFailure(false);
  await page.clock.runFor(30_100);
  await expect(panel.getByRole("heading", { name: "LALIGA · Fixture 9" })).toBeVisible();
  expect(api.calls.fixtures.has(10)).toBe(false);
});


test("browse previous and next fixtures without changing the lineup week", async ({ page }) => {
  const api = await mockFixtureMatches(page);
  await page.goto("/");
  const panel = page.locator(".fixture-matches-panel");
  await expect(panel.getByText("Up next", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Previous matchweek" }).click();
  await expect(panel.getByRole("heading", { name: "LALIGA · Fixture 7" })).toBeVisible();
  await expect(panel.getByLabel("Home goals: 0")).toHaveCount(10);
  await expect(panel.getByRole("region", { name: /^Forecast for/ })).toHaveCount(0);
  await panel.getByRole("button", { name: "Next matchweek" }).click();
  await expect(panel.getByRole("heading", { name: "LALIGA · Fixture 8" })).toBeVisible();
  await panel.getByRole("button", { name: "Next matchweek" }).click();
  await expect(panel.getByRole("heading", { name: "LALIGA · Fixture 9" })).toBeVisible();
  await expect(panel.getByText("Forecast closer to kickoff", { exact: true })).toHaveCount(10);
  await panel.getByRole("button", { name: "Current fixture" }).click();
  await expect(panel.getByRole("heading", { name: "LALIGA · Fixture 8" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Current fixture" })).toBeDisabled();
  expect(api.calls.writes).toEqual([]);
});
