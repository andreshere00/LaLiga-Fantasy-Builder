import { test, expect } from "@playwright/test";
import { mockApplication } from "./fixtures";

for (const theme of ["light", "dark"]) {
  for (const width of [320, 1440]) {
    test(`builder setup groups decisions and keeps actions reachable ${theme} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
      await mockApplication(page);
      await page.goto("/");
      const trigger = page.getByRole("button", { name: "Lineup builder", exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Build lineup" });
      await expect(dialog.getByRole("heading", { name: "Player pool", exact: true })).toBeVisible();
      const build = dialog.getByRole("button", { name: "Build", exact: true });
      await expect(build).toBeVisible();
      await expect(build).toBeEnabled();
      await expect(dialog.getByLabel("Include trading-only purchases")).toHaveCount(0);
      await dialog.getByLabel("My squad: Consider owned players", { exact: true }).uncheck();
      await expect(build).toBeDisabled();
      await expect(dialog.getByRole("status")).toContainText("Select a player source");
      await dialog.getByLabel("My squad: Consider owned players", { exact: true }).check();
      await dialog.getByLabel("Allow purchase recommendations", { exact: true }).check();
      await dialog.getByLabel("Include trading-only purchases", { exact: true }).check();
      await dialog.getByLabel("Allow purchase recommendations", { exact: true }).uncheck();
      await expect(dialog.getByLabel("Include trading-only purchases")).toHaveCount(0);
      await dialog.getByText("Choose mandatory players", { exact: false }).click();
      await dialog.getByRole("textbox", { name: "Search available players" }).fill("Player 01");
      await dialog.getByRole("button", { name: /Player 01 My squad/ }).click();
      await expect(dialog.getByText("1 / 11 selected", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Remove Player 01", exact: true }).click();
      await expect(dialog.getByText("0 / 11 selected", { exact: true })).toBeVisible();
      await dialog.getByRole("textbox", { name: "Search available players" }).fill("");
      await dialog.getByLabel("4-3-3", { exact: true }).check();
      await expect(dialog.getByText("1 selected", { exact: true })).toBeVisible();
      await expect(build).toBeVisible();
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await dialog.getByText("Choose mandatory players", { exact: false }).click();
      await dialog.locator(".fb-dialog-body").evaluate((el) => el.scrollTop = 0);
      await dialog.screenshot({ path: info.outputPath(`builder-setup-${theme}-${width}.png`) });
      await dialog.getByLabel("My squad: Consider owned players", { exact: true }).focus();
      await expect(dialog.getByLabel("My squad: Consider owned players", { exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }
}
