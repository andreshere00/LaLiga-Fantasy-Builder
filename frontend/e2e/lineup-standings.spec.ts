import { test, expect, type Page } from "@playwright/test";
import { mockApplication, standingsFixture } from "./fixtures";

test.use({ screenshot: "only-on-failure" });

function panels(page: Page) {
  return {
    managers: page.getByRole("region", { name: "Fantasy manager rankings", exact: true }),
    standings: page.getByRole("region", { name: "LALIGA standings table", exact: true }),
    heading: page.getByRole("heading", { name: "LALIGA standings", exact: true }),
    refresh: page.getByRole("button", { name: "Refresh LALIGA standings" }),
  };
}

for (const theme of ["light", "dark"]) {
  for (const width of [375, 800, 1024, 1440]) {
    test(`standings scroll independently ${theme} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await mockApplication(page, { rankingSize: 20 });
      await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
      await page.goto("/");
      const { managers, standings, heading } = panels(page);
      await expect(page.getByRole("table")).toBeVisible();
      await expect(page.getByRole("columnheader")).toHaveCount(10);
      const rankingBox = await page.getByRole("region", { name: "Players Ranking", exact: true }).boundingBox();
      const standingsBox = await page.getByRole("region", { name: "LALIGA standings", exact: true }).boundingBox();
      expect(standingsBox!.y).toBeGreaterThanOrEqual(rankingBox!.y + rankingBox!.height);
      await managers.scrollIntoViewIfNeeded();
      await managers.focus();
      await page.keyboard.press("End");
      await expect.poll(() => managers.evaluate((el) =>
        Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop))).toBeLessThan(2);
      await expect(page.getByRole("button", { name: /20 Manager 20/ })).toBeInViewport();
      const managerScroll = await managers.evaluate((el) => el.scrollTop);
      expect(await standings.evaluate((el) => el.scrollTop)).toBe(0);
      await standings.scrollIntoViewIfNeeded();
      await standings.focus();
      await page.keyboard.press("End");
      await expect.poll(() => standings.evaluate((el) =>
        Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop))).toBeLessThan(2);
      await expect(page.getByRole("rowheader", { name: "Club 20", exact: true })).toBeInViewport();
      expect(await managers.evaluate((el) => el.scrollTop)).toBe(managerScroll);
      await expect(heading).toBeInViewport();
      await expect(page.getByRole("columnheader", { name: "Ranking", exact: true })).toBeInViewport();
      if (width === 375 || width === 1440) {
        await standings.hover();
        await page.mouse.wheel(800, 0);
        await expect.poll(() => standings.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
        await expect(page.getByRole("rowheader", { name: "Club 20", exact: true })).toBeInViewport();
        await expect(page.getByRole("columnheader", { name: "Last 5 matches" })).toBeInViewport();
      }
      expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth })))
        .toEqual({ width, viewport: width });
      // Capture the initial two-card layout for visual QA after exercising overflow.
      await managers.evaluate((el) => { el.scrollTop = 0; });
      await standings.evaluate((el) => { el.scrollTop = 0; el.scrollLeft = 0; el.blur(); });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: info.outputPath(`lineup-standings-${theme}-${width}.png`), fullPage: true });
    });
  }
}

test("manager selection and standings refresh preserve selection, scroll, and focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApplication(page, { rankingSize: 20 });
  let requests = 0;
  await page.route("**/api/competitions/1/standings?*", async (route) => {
    requests++;
    await route.fulfill({ json: standingsFixture });
  });
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();
  const initialRequests = requests;
  const opponent = page.getByRole("button", { name: /Another Manager/ });
  await opponent.click();
  await expect(opponent).toHaveAttribute("aria-current", "true");
  expect(requests).toBe(initialRequests);
  const { managers, standings, refresh } = panels(page);
  await managers.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => managers.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await standings.hover();
  await page.mouse.wheel(10000, 10000);
  await expect.poll(() => standings.evaluate((el) =>
    Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop))).toBeLessThan(2);
  const before = await standings.evaluate((el) => [el.scrollTop, el.scrollLeft]);
  await refresh.click();
  await expect.poll(() => requests).toBe(initialRequests + 1);
  await expect(refresh).toBeFocused();
  expect(await standings.evaluate((el) => [el.scrollTop, el.scrollLeft])).toEqual(before);
  await expect(opponent).toHaveAttribute("aria-current", "true");
});

test("provider failure stays inside the panel and retry recovers", async ({ page }) => {
  await mockApplication(page);
  let unavailable = true;
  await page.route("**/api/competitions/1/standings?*", (route) => unavailable
    ? route.fulfill({ status: 503, json: { error: "standings_unavailable", detail: "Unavailable" } })
    : route.fulfill({ json: standingsFixture }));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("standings are unavailable");
  await expect(page.getByRole("heading", { level: 1, name: /Demo Manager.*lineup/i })).toBeVisible();
  await page.getByRole("button", { name: /Another Manager/ }).click();
  await expect(page.getByRole("button", { name: /Another Manager/ })).toHaveAttribute("aria-current", "true");
  unavailable = false;
  await page.getByRole("button", { name: "Retry standings" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  unavailable = true;
  await panels(page).refresh.click();
  await expect(page.getByRole("alert")).toContainText("previously retrieved");
  await expect(page.getByRole("table")).toBeVisible();
});

test("form details work by keyboard and tap, with focus restored on dismissal", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await mockApplication(page);
  await page.goto("/");
  const { standings } = panels(page);
  await expect(page.getByRole("table")).toBeVisible();
  await standings.scrollIntoViewIfNeeded();
  await standings.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  const result = page.getByRole("button", { name: /Win against Club 3,/ });
  await result.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Club 1 1–0 Club 3");
  await page.keyboard.press("Escape");
  await expect(result).toBeFocused();
  // Touch uses the same click/tap trigger rather than hover-only help.
  await result.tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(result).toBeFocused();
  await context.close();
});

test("two cards remain usable at a 200 percent zoom equivalent viewport", async ({ browser }) => {
  // 1440×1000 physical pixels at 200% zoom provide a 720×500 CSS-pixel viewport.
  // CSS zoom alone does not trigger the application's responsive media queries.
  const context = await browser.newContext({
    viewport: { width: 720, height: 500 }, deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await mockApplication(page, { rankingSize: 20 });
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();
  const { standings, refresh } = panels(page);
  await standings.scrollIntoViewIfNeeded();
  await standings.focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("rowheader", { name: "Club 20", exact: true })).toBeInViewport();
  await expect(refresh).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
