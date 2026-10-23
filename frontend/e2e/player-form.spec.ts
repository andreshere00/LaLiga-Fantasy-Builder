import { test, expect, type Page } from "@playwright/test";
import { detail, mockApplication } from "./fixtures";

function fixturesWithPoints(points: (number | null)[]) {
  // The endpoint returns newest first; the graph presents oldest first.
  return points.map((points, index) => ({
    ...detail.fixtures.fixtures[0], fantasyPointsTotal: points,
    minutesPlayed: index === 0 ? 0 : 90,
    fixture: { ...detail.fixtures.fixtures[0].fixture,
      date: new Date(Date.UTC(2026, 8, index + 1)).toISOString() },
    stats: { saves: { count: index + 1 }, daznPoints: { daznPoints: index } },
  })).reverse();
}

async function mockPoints(page: Page, points: (number | null)[]) {
  await mockApplication(page);
  await page.route("**/api/players/1/stats/detail?*", (route) => route.fulfill({ json: {
    ...detail, fixtures: { ...detail.fixtures, fixtures: fixturesWithPoints(points) },
  } }));
}

for (const { theme, width } of [{ theme: "light", width: 1440 }, { theme: "dark", width: 320 }]) {
  test(`fixture chart compares scores and supports keyboard match selection: ${theme} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    await mockPoints(page, [6, 4, 14, 11, 11]);
    await page.goto("/players/1#player-form-title");
    const form = page.getByRole("region", { name: "Form — fixture stats", exact: true });
    const radios = form.getByRole("radio");
    await expect(radios).toHaveCount(5);
    await expect(radios.last()).toBeChecked();
    await expect(form.locator(".player-form-total strong")).toHaveText("46");
    await expect(form.getByText("Average 9.2", { exact: true })).toBeVisible();
    const fiveFit = await form.locator(".player-form-chart-scroll").evaluate((element) =>
      element.scrollWidth <= element.clientWidth);
    expect(fiveFit).toBe(true);
    const bars = await form.locator(".player-form-bar").evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height));
    expect(bars[2]).toBeGreaterThan(bars[0]);
    expect(bars[0]).toBeGreaterThan(bars[1]);
    expect(bars[3]).toBeCloseTo(bars[4], 1);

    await radios.last().focus();
    await page.keyboard.press("ArrowLeft");
    await expect(radios.nth(3)).toBeChecked();
    await expect(radios.nth(3)).toBeFocused();
    const selected = form.getByRole("region", { name: "Selected fixture details" });
    await expect(selected).toContainText("2026-09-04");
    await selected.getByRole("button", { name: "Show match statistics", exact: true }).click();
    await expect(selected.locator(".player-form-details > div").filter({ has: page.locator("dt", { hasText: /^Saves$/ }) }))
      .toHaveText("Saves4");

    // Selection updates the expanded details without requiring another disclosure.
    await radios.first().focus();
    await page.keyboard.press("Space");
    await expect(radios.first()).toBeChecked();
    await expect(selected).toContainText("2026-09-01");
    await expect(selected.locator(".player-form-details > div").filter({ has: page.locator("dt", { hasText: /^Saves$/ }) }))
      .toHaveText("Saves1");
    const frame = await form.locator(".player-form-chart-scroll").boundingBox();
    const column = await form.locator(".player-form-fixture").first().boundingBox();
    expect(column!.x).toBeGreaterThanOrEqual(frame!.x);
    expect(column!.x + column!.width).toBeLessThanOrEqual(frame!.x + frame!.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await form.screenshot({ path: info.outputPath(`form-keyboard-${theme}-${width}.png`) });
  });
}

test("negative, zero and unavailable scores remain distinct in the graph and summary", async ({ page }) => {
  await mockPoints(page, [-3, 0, 8, null]);
  await page.goto("/players/1#player-form-title");
  const form = page.getByRole("region", { name: "Form — fixture stats", exact: true });
  await expect(form.locator(".player-form-total strong")).toHaveText("5");
  await expect(form).toContainText("Points unavailable for 1 of 4 fixtures.");
  await expect(form.getByText("Average · known scores", { exact: true })).toBeVisible();
  await expect(form.getByText("Average 1.7", { exact: true })).toBeVisible();
  await expect(form.getByRole("radio", { name: /: 0 fantasy points/ })).toHaveCount(1);
  await expect(form.getByRole("radio", { name: /Points unavailable/ })).toBeChecked();
  const negative = await form.locator(".player-form-bar.is-negative").boundingBox();
  const baseline = await form.locator(".player-form-zero-line").boundingBox();
  const positive = await form.locator(".player-form-bar:not(.is-negative)").boundingBox();
  expect(negative!.y).toBeCloseTo(baseline!.y, 0);
  expect(positive!.y + positive!.height).toBeCloseTo(baseline!.y, 0);
  await expect(form.getByRole("region", { name: "Selected fixture details" }))
    .toContainText("Unavailable");
});

test("all unavailable scores keep fixtures selectable without inventing an average", async ({ page }) => {
  await mockPoints(page, [null, null, null]);
  await page.goto("/players/1#player-form-title");
  await expect(page.locator(".player-form-total strong")).toHaveText("Unavailable");
  await expect(page.getByRole("radio", { name: /Points unavailable/ })).toHaveCount(3);
  await expect(page.locator(".player-form-bar, .player-form-zero, .player-form-average-key")).toHaveCount(0);
  await page.getByRole("button", { name: "Show match statistics", exact: true }).click();
  await expect(page.locator(".player-form-details")).toBeVisible();
});

test("longer history preserves previous results while loading and reveals the latest fixture", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  await mockApplication(page);
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/players/1/stats/detail?*", async (route) => {
    const count = Number(new URL(route.request().url()).searchParams.get("last"));
    if (count === 60) await pending;
    return route.fulfill({ json: { ...detail, fixtures: { ...detail.fixtures,
      fixtures: fixturesWithPoints(Array.from({ length: count }, (_, index) => index % 15)),
    } } });
  });
  await page.goto("/players/1#player-form-title");
  const form = page.getByRole("region", { name: "Form — fixture stats", exact: true });
  await expect(form.getByRole("radio")).toHaveCount(5);
  await form.getByRole("button", { name: "Last 60", exact: true }).click();
  await expect(form).toContainText("Updating fixture statistics… Previous results shown below.");
  await expect(form.getByRole("radio")).toHaveCount(5);
  release();
  await expect(form.getByRole("radio")).toHaveCount(60);
  await expect(form.getByRole("radio").last()).toBeChecked();
  const scroll = form.locator(".player-form-chart-scroll");
  expect(await scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(4000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await form.getByRole("radio").last().focus();
  await page.keyboard.press("ArrowLeft");
  await expect(form.getByRole("radio").nth(58)).toBeChecked();
});
