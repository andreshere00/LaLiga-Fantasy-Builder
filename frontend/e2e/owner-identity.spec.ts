import { test, expect } from "@playwright/test";
import { catalog, marketFixture, mockApplication } from "./fixtures";

const longName = "Manager With A Very Long Name For Ownership Recognition";

for (const theme of ["light", "dark"]) {
  for (const width of [375, 1440]) {
    for (const screen of ["market", "players"]) {
      test(`owner identity ${screen} ${theme} ${width}`, async ({ page }, info) => {
        await mockApplication(page);
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
        const teams = [
          { id: "t1", manager: { managerName: "Demo Manager" }, players: [
            { playerTeamId: "own", playerMaster: catalog[0] },
          ] },
          { id: "t2", manager: { managerName: "Other Manager", avatar: "https://example.com/manager.svg" }, players: [
            { playerTeamId: "other", playerMaster: catalog[13] },
          ] },
          { id: "t3", manager: { managerName: longName, avatar: "https://example.com/broken.svg" }, players: [
            { playerTeamId: "long", playerMaster: catalog[14] },
          ] },
        ];
        await page.route("https://example.com/manager.svg", (route) => route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#FF9913"/></svg>',
        }));
        await page.route("https://example.com/broken.svg", (route) => route.fulfill({ status: 404 }));
        await page.route("**/api/leagues/l1/teams", (route) => route.fulfill({ json: teams }));
        for (const team of teams) {
          await page.route(`**/api/leagues/l1/teams/${team.id}`, (route) => route.fulfill({ json: team }));
        }
        await page.route("**/api/market/leagues/l1", (route) => route.fulfill({ json: {
          ...marketFixture,
          marketPlayers: marketFixture.marketPlayers.map((item, index) => ({
            ...item,
            ...(index < 2 ? {
              sellerTeam: { id: teams[index + 1].id, manager: { managerName: teams[index + 1].manager.managerName } },
              playerTeam: { playerTeamId: index === 0 ? "other" : "long", teamId: teams[index + 1].id },
            } : {}),
          })),
        } }));
        await page.goto(`/${screen}?q=Player`);
        const cell = screen === "market" ? ".market-cell-seller" : ".players-owner-cell";
        const owner = page.locator(cell).getByRole("link", { name: "Other Manager", exact: true });
        await expect(owner).toBeVisible();
        await expect(owner).toHaveAttribute("href", "/?team=t2");
        await expect(owner.locator(".fb-avatar-image")).toBeVisible();
        await expect(owner.locator(".fb-avatar-image")).toHaveAttribute("src", "https://example.com/manager.svg");
        await owner.focus();
        await expect(owner).toBeFocused();
        const broken = page.locator(cell).getByRole("link", { name: longName, exact: true });
        await expect(broken.locator(".fb-avatar-fallback svg")).toBeVisible();
        await expect(broken.locator(".manager-identity-name")).toHaveText(longName);
        if (screen === "players") {
          const noPhoto = page.locator(cell).getByRole("link", { name: "Demo Manager", exact: true });
          await expect(noPhoto.locator(".fb-avatar-fallback svg")).toBeVisible();
          await expect(page.locator(".players-free-agent .manager-identity")).toHaveCount(0);
        } else {
          await expect(page.locator(cell).filter({ hasText: "LALIGA" }).locator(".manager-identity")).toHaveCount(0);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (width < 700) {
          expect(await broken.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        }
        await page.screenshot({ path: info.outputPath("owners.png"), fullPage: true });
      });
    }
  }
}
