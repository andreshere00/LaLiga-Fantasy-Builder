import { test, expect } from "@playwright/test";
import { detail, mockApplication } from "./fixtures";

for (const { theme, width } of [{ theme: "light", width: 1440 }, { theme: "dark", width: 320 }]) {
  test(`real club and UCL fallbacks load when upstream images fail: ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    await mockApplication(page);
    const fixture = { ...detail.fixtures.fixtures[0].fixture,
      homeTeam: "CEL", awayTeam: "MLG", competition: "champions_league", competitionLabel: "UCL",
      homeBadge: "https://example.com/broken-api.png", awayBadge: "https://example.com/broken-scraped.png",
      competitionBadge: "https://example.com/broken-ucl.png" };
    await page.route("**/api/players/1/stats/detail?*", (route) => route.fulfill({ json: {
      ...detail,
      fixtures: { ...detail.fixtures, fixtures: [{ ...detail.fixtures.fixtures[0], fixture }] },
      recent: { ...detail.recent, matches: [{ ...detail.recent.matches[0], fixture }] },
      upcoming: { ...detail.upcoming, matches: [{ ...detail.upcoming.matches[0], fixture }] },
    } }));
    await page.goto("/players/1#player-form-title");
    const celta = page.locator('.player-form-club-badge img[src$="spain-celta.png"]').first();
    const malaga = page.locator('.player-form-club-badge img[src$="spain-malaga.png"]').first();
    await expect(celta).toBeVisible();
    await expect(malaga).toBeVisible();
    await expect.poll(() => celta.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect.poll(() => malaga.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const ucl = page.locator('.player-match-competition-badge img[src$="tournaments-uefa-champions-league.png"]').first();
    await ucl.scrollIntoViewIfNeeded();
    await expect.poll(() => ucl.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator(".player-match-section").screenshot({ path: info.outputPath(`badges-${theme}.png`) });
    await expect(page.getByRole("link", { name: "Badges: football-logos.cc" })).toHaveAttribute("href", "https://football-logos.cc/");
  });
}
