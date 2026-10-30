import { expect, test, type Page } from "@playwright/test";

import { catalog, mockApplication } from "./fixtures";

const RED = "rgb(255, 75, 68)";
const INK = "rgb(0, 0, 0)";

function slot(player: (typeof catalog)[number]) {
  return { playerTeamId: "s" + player.id, playerMaster: player, buyoutClause: 10_000_000 };
}

function incompleteLineup() {
  const players = catalog.slice(0, 13).map(slot);
  return {
    teamId: "t1",
    weekNumber: 8,
    formation: {
      tacticalFormation: [4, 3, 3],
      goalkeeper: players.slice(0, 1),
      defender: players.slice(1, 5),
      midfield: players.slice(5, 8),
      striker: players.slice(8, 10),
      coach: [],
      captain: "s9",
    },
  };
}

async function openIncompleteLineup(page: Page, theme: "light" | "dark") {
  await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
  await mockApplication(page);
  await page.route(/\/api\/teams\/t1\/lineup$/, (route) => route.fulfill({
    json: incompleteLineup(),
  }));
  await page.goto("/");
}

test.describe("unfilled lineup position", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`missing position uses red with black text in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await openIncompleteLineup(page, theme);
      const emptySlot = page.getByRole("button", {
        name: "Not selected player, Needed to complete the lineup",
      });
      await expect(emptySlot).toBeVisible();
      await expect(emptySlot).toHaveCSS("background-color", RED);
      await expect(emptySlot.locator(".player-name-label")).toHaveCSS("color", INK);
      await emptySlot.hover();
      await expect(emptySlot).toHaveCSS("background-color", RED);
      const keeper = page.locator(".pitch-rows").getByRole("button", { name: /^Player 01/ });
      await expect(keeper).not.toHaveClass(/is-position-needed/);

      await page.getByRole("button", { name: "Next squad page" }).click();
      const candidate = page.locator(".squad-grid").getByRole("button", {
        name: /Player 11, Needed to complete the lineup/,
      });
      await expect(candidate).toBeVisible();
      await expect(candidate).toHaveCSS("background-color", RED);
      await expect(candidate.locator(".player-name-label")).toHaveCSS("color", INK);
      const starter = page.locator(".squad-grid").getByRole("button", { name: /^Player 09/ });
      await expect(starter).not.toHaveClass(/is-position-needed/);
    });
  }

  test("phone lineup keeps the missing-position contrast", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openIncompleteLineup(page, "light");
    const emptySlot = page.getByRole("button", {
      name: "Not selected player, Needed to complete the lineup",
    });
    await emptySlot.scrollIntoViewIfNeeded();
    await expect(emptySlot).toBeVisible();
    await expect(emptySlot).toHaveCSS("background-color", RED);
    await expect(emptySlot.locator(".player-name-label")).toHaveCSS("color", INK);
  });
});
