import { expect, test } from "@playwright/test";

import { catalog, mockApplication } from "./fixtures";

const closing = {
  id: "soon",
  playerMaster: { ...catalog[13], nickname: "Closing" },
  expirationDate: "2026-10-12T12:00:30Z",
};
const later = {
  id: "later",
  playerMaster: { ...catalog[14], nickname: "Later" },
  expirationDate: "2026-10-12T12:30:00Z",
};

test.describe("market seal end warning", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`final minute uses a warning icon in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.clock.install({ time: new Date("2026-10-12T12:00:00Z") });
      await mockApplication(page);
      await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
      await page.route("**/api/market/leagues/l1", (route) => route.fulfill({
        json: { userBids: [], marketPlayers: [closing, later] },
      }));
      await page.goto("/market");
      const soon = page.locator(".market-row", { hasText: "Closing" });
      const hour = page.locator(".market-row", { hasText: "Later" });
      const warning = soon.getByLabel("Less than 1 minute remaining");
      await expect(warning).toBeVisible();
      await expect(warning).toHaveClass(/is-expiring/);
      await expect(warning).not.toHaveClass(/is-urgent/);
      await expect(warning.locator("img")).toBeVisible();
      await warning.focus();
      await expect(page.getByRole("tooltip")).toHaveText(
        "This listing expires in less than one minute.",
      );
      await expect(hour.locator(".market-seal-end")).toHaveClass(/is-urgent/);
      await expect(hour.locator(".market-seal-end")).toHaveCSS("border-left-width", "3px");
      await expect(hour.locator(".is-expiring")).toHaveCount(0);
    });
  }

  test("phone market keeps the final-minute warning visible", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.clock.install({ time: new Date("2026-10-12T12:00:00Z") });
    await mockApplication(page);
    await page.route("**/api/market/leagues/l1", (route) => route.fulfill({
      json: { userBids: [], marketPlayers: [closing, later] },
    }));
    await page.goto("/market");
    const warning = page.getByLabel("Less than 1 minute remaining");
    await warning.scrollIntoViewIfNeeded();
    await expect(warning).toBeVisible();
    await expect(warning.locator("img")).toBeVisible();
  });
});
