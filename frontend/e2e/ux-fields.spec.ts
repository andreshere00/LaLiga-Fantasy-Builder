import { test, expect } from "@playwright/test";
import { mockApplication } from "./fixtures";

for (const { theme, width } of [{ theme: "light", width: 1440 }, { theme: "dark", width: 375 }]) {
  test(`bid guidance, correction and cancellation: ${theme} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApplication(page);
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    await page.goto("/market");
    const trigger = page.getByRole("button", { name: "Options", exact: true }).first();
    await trigger.click();
    await page.getByRole("menuitem", { name: "Hire", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Hire player", exact: true });
    await expect(dialog).toHaveAccessibleDescription("Bid for Player 14.");
    const amount = dialog.getByRole("textbox", { name: "Bid amount", exact: true });
    await expect(amount).toBeFocused();
    await expect(amount).toHaveAccessibleDescription(/Amount must be at least 3.300.000 €/);
    await amount.fill("invalid");
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(amount).toHaveAccessibleDescription(/Enter a whole euro amount/);
    await expect(dialog.getByRole("button", { name: "Place bid", exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`bid-guidance-${theme}-${width}.png`) });
    await amount.fill("4000000");
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Place bid", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`date guidance remains usable within the dialog: ${theme} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApplication(page);
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    await page.goto("/players/1");
    const trigger = page.getByRole("button", { name: "Custom", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Custom value period", exact: true });
    await expect(dialog).toHaveAccessibleDescription(/Cancel keeps your current period/);
    await dialog.getByLabel("From", { exact: true }).fill("2026-10-20");
    await dialog.getByLabel("To", { exact: true }).fill("2026-10-01");
    await expect(dialog.getByLabel("To", { exact: true })).toHaveAccessibleDescription(
      "Choose an end date on or after the start date.",
    );
    await expect(dialog.getByRole("button", { name: "Apply range", exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`date-guidance-${theme}-${width}.png`) });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
