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
        const sections = page.getByRole("navigation", { name: "Sections", exact: true });
        if (width <= 1000) {
          await expect(sections).toHaveCSS("position", "fixed");
          const bounds = (await sections.boundingBox())!;
          expect(bounds.y + bounds.height).toBeCloseTo(page.viewportSize()!.height, 0);
          expect(bounds.width).toBe(width);
        } else {
          await expect(sections).toHaveCSS("position", "static");
        }
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
  expect(mobileHeight).toBeGreaterThan(0);
  expect(desktopHeight).toBeGreaterThan(0);
  await expect(page.getByRole("navigation", { name: "Sections", exact: true })).toHaveCSS("position", "static");
  await expect(page.locator(".app-shell")).toHaveCSS("padding-bottom", "0px");
});

for (const theme of ["light", "dark"]) {
  test(`mobile bottom navigation preserves links, keyboard access and footer clearance: ${theme}`, async ({ page }, info) => {
    await mockApplication(page);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    await page.goto("/players/1");
    const sections = page.getByRole("navigation", { name: "Sections", exact: true });
    await expect(sections.getByRole("link", { name: "Players", exact: true })).toHaveAttribute("aria-current", "page");
    const market = sections.getByRole("link", { name: "Market", exact: true });
    await market.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/market$/);
    await expect(market).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".market-data-row")).toHaveCount(7);
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      return document.querySelector(".app-footer")!.getBoundingClientRect().bottom
        - document.querySelector(".nav-tabs")!.getBoundingClientRect().top;
    })).toBeLessThanOrEqual(1);
    const sizes = await sections.getByRole("link").evaluateAll((links) => links.map((link) => {
      const rect = link.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }));
    expect(sizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`bottom-navigation-${theme}.png`) });
  });
}
