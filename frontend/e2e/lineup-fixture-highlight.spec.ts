import { expect, test, type Page } from "@playwright/test";

import { catalog, mockApplication } from "./fixtures";

const LIGHT_PURPLE = "rgb(192, 79, 253)";
const DARK_PURPLE = "rgb(227, 175, 255)";

function weekStats(weekNumber: number, goals: number, conceded: number) {
  return {
    weekNumber,
    stats: {
      mins_played: [90, 2],
      goals: [goals, goals * 4],
      goals_conceded: [conceded, conceded === 0 ? 4 : -conceded],
    },
  };
}

function roster() {
  const players = catalog.slice(0, 13).map((player, index) => {
    const history = index === 0
      ? [weekStats(8, 0, 0)]
      : index === 1
        ? [weekStats(7, 1, 1)]
        : index === 10
          ? [weekStats(8, 2, 0)]
          : player.lastStats;
    return {
      playerTeamId: "s" + player.id,
      buyoutClause: 10_000_000,
      playerMaster: { ...player, lastStats: history },
    };
  });
  return {
    id: "t1",
    manager: { managerName: "Demo Manager" },
    teamMoney: 50_000_000,
    teamValue: 80_000_000,
    playersNumber: players.length,
    players,
  };
}

async function openHighlightedLineup(page: Page, theme: "light" | "dark") {
  await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
  await mockApplication(page);
  const started = {
    id: "1",
    matchState: 2,
    matchDate: "2026-10-11T16:00:00Z",
    localScore: 2,
    visitorScore: 0,
  };
  await page.route(/\/api\/calendar\/weeks\/8$/, (route) => route.fulfill({ json: [started] }));
  await page.route(/\/api\/leagues\/l1\/teams\/t1$/, (route) => route.fulfill({ json: roster() }));
  await page.goto("/");
  await expect(page.locator(".score-week")).toHaveText("F8");
}

test.describe("lineup fixture highlights", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`played fixture marks scorers and clean-sheet keepers ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await openHighlightedLineup(page, theme);
      const pitch = page.locator(".pitch-rows");
      const highlighted = pitch.locator(".is-fixture-highlight");
      const purple = theme === "light" ? LIGHT_PURPLE : DARK_PURPLE;
      await expect(highlighted).toHaveCount(2);
      const keeper = pitch.getByRole("button", { name: /Player 01.*No goals conceded/ });
      const scorer = pitch.getByRole("button", { name: /Player 11.*Scored 2 goals/ });
      await expect(keeper).toBeVisible();
      await expect(scorer).toBeVisible();
      await expect(keeper).toHaveCSS("background-color", purple);
      await expect(scorer).toHaveCSS("background-color", purple);
      await scorer.hover();
      await expect(scorer).toHaveCSS("background-color", purple);
      await expect(page.locator(".squad-tile.is-fixture-highlight")).toHaveCount(0);

      await page.getByRole("button", { name: "Previous fixture" }).click();
      await expect(page.locator(".score-week")).toHaveText("F7");
      await expect(pitch.locator(".is-fixture-highlight")).toHaveCount(1);
      await expect(pitch.getByRole("button", { name: /Player 02.*Scored a goal/ })).toBeVisible();

      await page.getByRole("button", { name: "Next fixture" }).click();
      await page.getByRole("button", { name: "Next fixture" }).click();
      await expect(page.locator(".score-week")).toHaveText("F9");
      await expect(pitch.locator(".is-fixture-highlight")).toHaveCount(0);
    });
  }

  test("phone lineup keeps the same goal highlight", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openHighlightedLineup(page, "light");
    const scorer = page.locator(".pitch-rows").getByRole("button", {
      name: /Player 11.*Scored 2 goals/,
    });
    await scorer.scrollIntoViewIfNeeded();
    await expect(scorer).toBeVisible();
    await expect(scorer).toHaveCSS("background-color", LIGHT_PURPLE);
    await expect(page.locator(".squad-tile.is-fixture-highlight")).toHaveCount(0);
  });
});
