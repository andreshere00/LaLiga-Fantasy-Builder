import { test, expect, type Page } from "@playwright/test";
import { mockApplication } from "./fixtures";

async function expectPinnedHeaders(page: Page) {
  await expect.poll(async () => {
    const nav = await page.locator(".app-header").boundingBox();
    const title = await page.locator(".market-toolbar").boundingBox();
    return nav && title ? Math.abs(nav.y) + Math.abs(title.y - nav.height) : Infinity;
  }).toBeLessThan(2);
  expect(await page.locator(".market-toolbar").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + 8, box.y + box.height / 2));
  })).toBe(true);
}

for (const theme of ["light", "dark"]) {
  for (const width of [375, 800, 1024, 1440, 720]) {
    for (const route of ["market", "players"]) {
      test(`sticky navigation and ${route} title: ${theme} ${width}`, async ({ page }, info) => {
        await mockApplication(page);
        await page.setViewportSize({ width, height: width === 720 ? 500 : 800 });
        await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
        await page.goto(route === "players" ? "/players?q=Player" : "/market");
        await expect(page.locator(route === "players" ? ".players-row" : ".market-data-row").first()).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 600));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
        await expectPinnedHeaders(page);
        await page.screenshot({ path: info.outputPath(`sticky-${route}-${theme}-${width}.png`) });
        if (width <= 1000) {
          await page.getByRole("button", { name: "Open settings and account options" }).click();
          const league = page.getByRole("combobox", { name: "League", exact: true });
          await expect(league).toBeVisible();
          await league.click();
          await expect(page.getByRole("option", { name: "Demo League", exact: true })).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(league).toBeFocused();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
    }
  }
}

test("sticky title follows the navigation height after resizing", async ({ page }) => {
  await mockApplication(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/players?q=Player");
  await expect(page.locator(".players-row").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 600));
  await expectPinnedHeaders(page);
  const mobileHeight = (await page.locator(".app-header").boundingBox())!.height;
  await page.setViewportSize({ width: 1440, height: 800 });
  await expectPinnedHeaders(page);
  const desktopHeight = (await page.locator(".app-header").boundingBox())!.height;
  expect(desktopHeight).toBeLessThan(mobileHeight);
});
