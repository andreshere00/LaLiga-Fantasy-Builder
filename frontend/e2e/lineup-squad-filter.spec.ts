import { expect, test } from "@playwright/test";

import { detail, mockApplication } from "./fixtures";

test("squad filter keeps goalkeepers and can be cleared", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApplication(page);
  await page.goto("/");
  const squad = page.locator(".squad-grid--ready");
  await expect(squad.getByRole("button", { name: /^Player 06/ })).toBeVisible();
  await page.getByRole("button", { name: "Filter squad" }).click();
  await page.locator("summary").filter({ hasText: "Club" }).click();
  await page.locator("summary").filter({ hasText: "FSYP" }).click();
  await expect(page.getByRole("slider", { name: /^(Minimum|Maximum) FSYP$/ })).toHaveCount(2);
  await page.screenshot({ path: info.outputPath("squad-filter-desktop-light.png") });
  await page.getByRole("button", { name: "Goalkeeper", exact: true }).click();
  await expect(page.locator("summary").filter({ hasText: "Position" })).toContainText("Goalkeeper");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(squad.getByRole("button", { name: /^Player 06/ })).toBeVisible();

  await page.getByRole("button", { name: "Filter squad" }).click();
  await page.getByRole("button", { name: "Goalkeeper", exact: true }).click();
  await page.getByRole("button", { name: /^Show \d+ players?$/ }).click();
  await expect(page.getByRole("dialog", { name: "Filter squad" })).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Showing" })).toBeVisible();
  await expect(squad.getByRole("button", { name: /^Player 01/ })).toBeVisible();
  await expect(squad.getByRole("button", { name: /^Player 06/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(squad.getByRole("button", { name: /^Player 06/ })).toBeVisible();
});

test("phone squad filter opens as a dialog", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockApplication(page);
  await page.addInitScript(() => localStorage.setItem("lfb-theme", "dark"));
  await page.goto("/");
  await page.getByRole("button", { name: "Filter squad" }).click();
  const dialog = page.getByRole("dialog", { name: "Filter squad" });
  await expect(dialog.getByRole("group", { name: "Position" })).toBeVisible();
  await expect(dialog.locator("summary")).toHaveCount(6);
  await expect(dialog.getByRole("group", { name: "Club" })).toBeHidden();
  const clubDisclosure = dialog.locator("summary").filter({ hasText: "Club" });
  await clubDisclosure.focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("group", { name: "Club" })).toBeVisible();
  const crest = dialog.locator(".squad-filter-club-crest img").first();
  await expect(crest).toBeVisible();
  await expect(crest).toHaveCSS("object-fit", "contain");
  await expect(clubDisclosure).toBeFocused();
  await page.screenshot({ path: info.outputPath("squad-filter-phone-dark.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("start probability slider keeps players at or above the minimum", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApplication(page);
  await page.route("**/api/players/*/stats/profile", (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3];
    return route.fulfill({ json: {
      ...detail.profile, playerId: id,
      startProbability: { matchweek: 9, percent: { "1": 100, "2": 0, "3": 85 }[id] ?? 50 },
    } });
  });
  await page.goto("/");
  const squad = page.locator(".squad-grid--ready");
  await expect(squad.getByRole("button", { name: /^Player 02/ })).toBeVisible();
  await page.getByRole("button", { name: "Filter squad" }).click();
  const dialog = page.getByRole("dialog", { name: "Filter squad" });
  await dialog.locator("summary").filter({ hasText: "Start probability" }).click();
  const thumb = dialog.getByRole("slider", { name: "Minimum start probability" });
  await thumb.focus();
  for (const key of ["PageUp", "PageUp", "PageUp", "ArrowRight", "ArrowRight"]) {
    await page.keyboard.press(key);
  }
  await expect(thumb).toHaveValue("85");
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "85");
  await expect(dialog.locator("summary").filter({ hasText: "Start probability" }))
    .toContainText("At least 85%");
  await page.screenshot({ path: info.outputPath("squad-filter-probability.png") });
  await dialog.getByRole("button", { name: "Show 2 players" }).click();
  await expect(squad.getByRole("button", { name: /^Player 01/ })).toBeVisible();
  await expect(squad.getByRole("button", { name: /^Player 03/ })).toBeVisible();
  await expect(squad.getByRole("button", { name: /^Player 02/ })).toHaveCount(0);
});
