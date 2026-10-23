import { test, expect } from "@playwright/test";
import { mockApplication } from "./fixtures";

for (const { theme, width } of [{ theme: "light", width: 1440 }, { theme: "dark", width: 375 }]) {
  test(`selected calendar endpoints stay readable: ${theme} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockApplication(page);
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    await page.goto("/players/1");
    await page.getByRole("button", { name: "Custom", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Custom value period", exact: true });
    await dialog.getByLabel("From", { exact: true }).fill("2026-10-01");
    await dialog.getByLabel("To", { exact: true }).fill("2026-10-24");
    const endpoints = dialog.locator(".rdp-range_start button, .rdp-range_end button");
    await expect(endpoints).toHaveText(["1", "24"]);
    const contrasts = await endpoints.evaluateAll((buttons) => {
      const luminance = (color: string) => {
        const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      return buttons.map((button) => {
        const style = getComputedStyle(button);
        const text = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
      });
    });
    for (const contrast of contrasts) expect(contrast).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: info.outputPath(`calendar-endpoints-${theme}-${width}.png`) });
  });

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
    const bodySize = await dialog.locator(".fb-dialog-body").evaluate((element) => ({
      width: element.clientWidth, content: element.scrollWidth,
    }));
    expect(bodySize.content).toBeLessThanOrEqual(bodySize.width);
    await page.screenshot({ path: info.outputPath(`date-guidance-${theme}-${width}.png`) });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
