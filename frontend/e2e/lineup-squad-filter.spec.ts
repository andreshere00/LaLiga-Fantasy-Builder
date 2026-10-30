import { expect, test } from "@playwright/test";

import { mockApplication } from "./fixtures";

test("squad filter keeps goalkeepers and can be cleared", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApplication(page);
  await page.goto("/");
  const squad = page.locator(".squad-grid--ready");
  await expect(squad.getByRole("button", { name: /^Player 06/ })).toBeVisible();
  await page.getByRole("button", { name: "Filter squad" }).click();
  await page.locator("summary").filter({ hasText: "Club" }).click();
  await page.screenshot({ path: info.outputPath("squad-filter-desktop-light.png") });
  await page.getByRole("button", { name: "Goalkeeper", exact: true }).click();
  await expect(page.locator("summary").filter({ hasText: "Position" })).toContainText("1 selected");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(squad.getByRole("button", { name: /^Player 06/ })).toBeVisible();

  await page.getByRole("button", { name: "Filter squad" }).click();
  await page.getByRole("button", { name: "Goalkeeper", exact: true }).click();
  await page.getByRole("button", { name: "Apply filters" }).click();
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
