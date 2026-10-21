import { test, expect } from "@playwright/test";
import { detail, mockApplication } from "./fixtures";

for (const { theme, width } of [{ theme: "light", width: 1440 }, { theme: "dark", width: 375 }]) {
  test(`player sections and disclosures support keyboard navigation ${theme} ${width}`, async ({ page }, info) => {
    await mockApplication(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    await page.goto("/players/1");
    await expect(page.getByRole("heading", { name: "Fantasy outlook", exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`player-overview-${theme}-${width}.png`) });

    const averages = page.getByRole("region", { name: "Averages per match", exact: true });
    const moreAverages = averages.getByRole("button", { name: "More averages", exact: true });
    await moreAverages.click();
    const performance = page.getByRole("dialog", { name: "Per-match performance", exact: true });
    await expect(performance).toBeVisible();
    await expect(performance.getByRole("heading", { name: "Defending", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(performance).toHaveCount(0);
    await expect(moreAverages).toBeFocused();

    const sections = page.getByRole("navigation", { name: "Player sections" });
    await sections.getByRole("link", { name: "Market value", exact: true }).focus();
    await page.keyboard.press("Enter");
    const marketHeading = page.getByRole("heading", { name: "Market value", exact: true });
    await expect(marketHeading).toBeFocused();
    const headingTop = await marketHeading.evaluate((element) => element.getBoundingClientRect().top);
    const headerBottom = await page.locator(".app-header").evaluate((element) => element.getBoundingClientRect().bottom);
    const shortcutsBottom = await sections.evaluate((element) => getComputedStyle(element).position === "sticky"
      ? element.getBoundingClientRect().bottom : 0);
    expect(headingTop).toBeGreaterThanOrEqual(Math.max(headerBottom, shortcutsBottom));
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Season", exact: true })).toBeFocused();
    await expect(page.locator(".player-detail-market-period")).toHaveText("Shown period: 2026-10-01 – 2026-10-12");
    const dailyValues = page.locator(".player-market-history summary");
    await dailyValues.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("table", { name: "Market values for the shown period" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Daily market values" }).getByRole("row")).toHaveCount(13);
    await page.screenshot({ path: info.outputPath(`player-market-${theme}-${width}.png`) });

    await sections.getByRole("link", { name: "Form", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Form — fixture stats", exact: true })).toBeFocused();
    const showStatistics = page.getByRole("button", { name: "Show match statistics", exact: true });
    await showStatistics.click();
    await expect(page.locator(".player-form-details")).toHaveCount(3);
    await page.getByRole("button", { name: "Hide match statistics", exact: true }).click();
    await expect(page.locator(".player-form-details")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const allMissing of [false, true]) {
  test(`fixture totals distinguish missing points from zero: ${allMissing ? "all" : "some"} missing`, async ({ page }) => {
    await mockApplication(page);
    await page.route("**/api/players/1/stats/detail?*", (route) => route.fulfill({ json: {
      ...detail, fixtures: { ...detail.fixtures, fixtures: detail.fixtures.fixtures.map((row, index) => ({
        ...row, fantasyPointsTotal: allMissing || index === 0 ? null : 0,
      })) },
    } }));
    await page.goto("/players/1");
    const total = page.locator(".player-form-total");
    await expect(total).toContainText("Known fantasy points");
    await expect(total.locator("strong")).toHaveText(allMissing ? "Unavailable" : "0");
    await expect(total).toContainText(`Points unavailable for ${allMissing ? 3 : 1} of 3 fixtures.`);
  });
}

test("partial failures preserve useful sections and can be retried", async ({ page }) => {
  await mockApplication(page);
  let recovered = false;
  await page.route("**/api/players/1/stats/detail?*", (route) => route.fulfill({ json: recovered ? detail : {
    ...detail, recent: null, market: null,
    segmentErrors: [
      { segment: "recent", code: "scraping_unavailable", detail: "Temporarily unavailable." },
      { segment: "market", code: "upstream_unavailable", detail: "Temporarily unavailable." },
    ],
  } }));
  await page.goto("/players/1");
  await expect(page.getByRole("status")).toContainText("Some player data is unavailable.");
  await expect(page.getByText("Recent matches are temporarily unavailable.", { exact: true })).toBeVisible();
  await expect(page.getByText("No recent matches available.", { exact: true })).toHaveCount(0);
  await expect(page.locator(".player-form-card")).toHaveCount(3);
  recovered = true;
  await page.getByRole("button", { name: "Retry player data", exact: true }).click();
  await expect(page.getByText("Some player data is unavailable.", { exact: false })).toHaveCount(0);
  await expect(page.locator(".player-detail-deltas")).toContainText("2.100.000 €");
  await expect(page.locator(".player-match-group").first().getByRole("listitem")).toHaveCount(1);
});

test("an empty market period keeps the current price visible", async ({ page }) => {
  await mockApplication(page);
  await page.route("**/api/players/1/stats/detail?*", (route) => route.fulfill({ json: {
    ...detail, market: { ...detail.market, window: { ...detail.market.window, series: [] } },
  } }));
  await page.goto("/players/1");
  await expect(page.locator(".player-detail-deltas")).toContainText("2.100.000 €");
  await expect(page.getByText("No market history in this period. Choose a different period.", { exact: true })).toBeVisible();
});

test("failed period updates retain the previous result with truthful scope and recovery", async ({ page }) => {
  await mockApplication(page);
  let fail = true;
  let release: () => void = () => {};
  const response = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/players/1/stats/detail?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("preset") !== "5d") {
      return route.fulfill({ json: detail });
    }
    await response;
    return fail ? route.fulfill({ status: 503, json: { error: "unavailable" } })
      : route.fulfill({ json: { ...detail, market: { ...detail.market,
        window: { ...detail.market.window, from: "2026-10-08" } } } });
  });
  await page.goto("/players/1");
  const period = page.locator(".player-detail-market-period");
  await expect(period).toContainText("2026-10-01");
  const preset = page.getByRole("button", { name: "5d", exact: true });
  await preset.click();
  await expect(page.getByText("Updating market history… Previous period shown below.", { exact: true })).toBeVisible();
  await expect(preset).toBeFocused();
  await expect(period).toContainText("2026-10-01");
  release();
  await expect(page.getByRole("alert")).toHaveText("Player data could not be updated. Previous results are still shown.");
  await expect(period).toContainText("2026-10-01");
  await expect(page.locator(".player-form-card")).toHaveCount(3);
  fail = false;
  await page.getByRole("button", { name: "Retry market history", exact: true }).click();
  await expect(period).toContainText("2026-10-08");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("initial detail failures offer a working retry", async ({ page }) => {
  await mockApplication(page);
  let fail = true;
  await page.route("**/api/players/1/stats/detail?*", (route) => fail
    ? route.fulfill({ status: 503, json: { error: "unavailable" } })
    : route.fulfill({ json: detail }));
  await page.goto("/players/1");
  await expect(page.getByRole("alert")).toContainText("Player details could not be loaded.");
  await expect(page.getByRole("heading", { name: "Player details unavailable", exact: true })).toBeFocused();
  await expect(page.locator(".player-detail-header")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Retry player data", exact: true }).click();
  await expect(page.locator(".player-form-card")).toHaveCount(3);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const { theme, width } of [{ theme: "light", width: 1440 }, { theme: "dark", width: 375 }]) {
  test(`missing player has a clear catalog recovery: ${theme} ${width}`, async ({ page }, info) => {
    await mockApplication(page);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    await page.route("**/api/players/999999/stats/detail?*", (route) =>
      route.fulfill({ status: 404, json: { error: "player_not_found" } }));
    await page.goto("/players/999999");
    await expect(page.getByRole("heading", { name: "Player not found", exact: true })).toBeFocused();
    await expect(page.getByRole("alert")).toContainText("We couldn’t find a player with this ID.");
    await expect(page.getByRole("navigation", { name: "Player sections" })).toHaveCount(0);
    await expect(page.locator(".player-detail-header, .player-form-section, .player-market-value-section")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry player data", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Favorite/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`player-not-found-${theme}-${width}.png`) });
    await page.keyboard.press("Tab");
    const browse = page.getByRole("link", { name: "Browse players", exact: true });
    await expect(browse).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/players$/);
    await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
  });
}

test("invalid player links offer catalog navigation without requesting statistics", async ({ page }) => {
  await mockApplication(page);
  const reads: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/stats/detail")) reads.push(request.url());
  });
  await page.goto("/players/not-a-player");
  await expect(page.getByRole("heading", { name: "Player not found", exact: true })).toBeFocused();
  await expect(page.getByRole("alert")).toContainText("This player link is invalid.");
  await expect(page.getByRole("link", { name: "Browse players", exact: true })).toHaveAttribute("href", "/players");
  expect(reads).toEqual([]);
});

test("a confirmed missing player replaces previously loaded results", async ({ page }) => {
  await mockApplication(page);
  await page.route("**/api/players/1/stats/detail?*", (route) =>
    new URL(route.request().url()).searchParams.get("preset") === "5d"
      ? route.fulfill({ status: 404, json: { error: "player_not_found" } })
      : route.fulfill({ json: detail }));
  await page.goto("/players/1");
  await expect(page.locator(".player-form-card")).toHaveCount(3);
  await page.getByRole("button", { name: "5d", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Player not found", exact: true })).toBeFocused();
  await expect(page.locator(".player-form-card, .player-detail-header")).toHaveCount(0);
});
