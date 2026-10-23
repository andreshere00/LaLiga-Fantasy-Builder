import { test, expect } from "@playwright/test";
import { catalog, detail, mockApplication } from "./fixtures";

const seasonAverages = [
  ["G", "Goals", 0], ["T", "Shots", 5.33], ["TaP", "Shots on target", 1.78],
  ["A", "Assists", 0.67], ["A SinGol", "Assists without a goal", 1.33],
  ["PC", "Key passes", 3.56], ["CF", "Corners won", 1.56],
  ["Reg", "Successful dribbles", 4], ["-Pos", "Possessions lost", 19],
  ["DE", "Effective clearances", 0.22], ["PI", "Interceptions", 0.33],
  ["BR", "Balls recovered", 0.11], ["FR", "Fouls won", 1.44], ["-FC", "Fouls committed", 0.89],
].map(([code, label, value]) => ({ code, label, value }));

test("paired season crosses show their own share alongside shooting", async ({ page }, info) => {
  await mockApplication(page);
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.route("**/api/players/1/stats/detail?*", (route) => route.fulfill({ json: {
    ...detail, profile: { ...detail.profile, averages: [...seasonAverages,
      { code: "C", label: "Crosses", value: 4 },
      { code: "CP", label: "Accurate crosses", value: 1 },
    ] },
  } }));
  await page.goto("/players/1");
  await page.getByRole("button", { name: "More averages", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Per-match performance", exact: true });
  await expect(dialog.locator("figure")).toHaveCount(2);
  await expect(dialog.getByText("≈25%", { exact: true })).toBeVisible();
  const dimensions = await dialog.locator(".fb-dialog-body").evaluate((element) => ({
    width: element.clientWidth, content: element.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
  await page.screenshot({ path: info.outputPath("performance-two-shares-800.png") });
});

test("mixed-source means retain their sample labels without a synthetic share", async ({ page }) => {
  await mockApplication(page);
  await page.route("**/api/players", (route) => route.fulfill({ json: catalog.map((player, index) =>
    index === 0 ? { ...player, lastStats: [1, 2, 3].map((weekNumber) => ({
      weekNumber, totalPoints: 2,
      stats: { mins_played: [90, 2], total_scoring_att_on_target: [1, 0] },
    })) } : player) }));
  await page.route("**/api/players/1/stats/detail?*", (route) => route.fulfill({ json: {
    ...detail, profile: { ...detail.profile, averages: seasonAverages.filter((row) => row.code !== "TaP") },
  } }));
  await page.goto("/players/1");
  await page.getByRole("button", { name: "More averages", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Per-match performance", exact: true });
  await expect(dialog.locator("figure")).toHaveCount(0);
  const shotsOnTarget = dialog.locator(".player-metric-reading").filter({ hasText: "Shots on target" });
  await expect(shotsOnTarget).toContainText("Fantasy · 3 played matchweeks");
  await expect(shotsOnTarget).toContainText("1.00");
});

for (const theme of ["light", "dark"]) {
  for (const width of [375, 1440]) {
    test(`performance explains means, event shares and unavailable data ${theme} ${width}`, async ({ page }, info) => {
      await mockApplication(page);
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
      await page.route("**/api/players", (route) => route.fulfill({ json: catalog.map((player, index) =>
        index === 0 ? { ...player, positionId: 4, nickname: "Demo forward" } : player) }));
      await page.route("**/api/players/1/stats/detail?*", (route) => route.fulfill({ json: {
        ...detail, profile: { ...detail.profile, averages: seasonAverages },
      } }));
      await page.goto("/players/1");
      const trigger = page.getByRole("button", { name: "More averages", exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Per-match performance", exact: true });
      await expect(dialog).toHaveAccessibleDescription(/Demo forward.*not per 90 minutes/);
      await expect(dialog.getByText("≈33%", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Other attempts", { exact: false })).toContainText("3.55");
      await expect(dialog.getByText("Accurate crosses / all crosses", { exact: true })).toHaveCount(0);
      const shooting = dialog.getByRole("region", { name: "Shooting", exact: true });
      await expect(shooting.locator(".player-metric-reading").filter({ hasText: "Goals scored." }))
        .toContainText("0.00");
      const dimensions = await dialog.locator(".fb-dialog-body").evaluate((element) => ({
        viewport: element.clientWidth, content: element.scrollWidth,
      }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
      await page.screenshot({ path: info.outputPath(`performance-top-${theme}-${width}.png`) });
      await dialog.locator(".player-missing-metrics summary").click();
      await expect(dialog.getByText("Unavailable metrics (5)", { exact: true })).toBeVisible();
      await expect(dialog.locator(".player-missing-metrics").getByText("Crosses", { exact: true })).toBeVisible();
      await expect(dialog.locator(".player-missing-metrics").getByText("Goals", { exact: true })).toHaveCount(0);
      await dialog.locator(".player-metric-methodology summary").click();
      await expect(dialog.getByRole("link", { name: "LaLiga Fantasy", exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`performance-method-${theme}-${width}.png`) });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }
}
