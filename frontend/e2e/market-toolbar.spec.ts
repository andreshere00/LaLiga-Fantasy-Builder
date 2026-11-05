import { expect, test } from "@playwright/test";
import { mockApplication } from "./fixtures";

for (const [width, theme, language] of [[320, "light", "es"], [500, "dark", "en"], [800, "light", "en"], [1440, "dark", "es"]] as const) {
  test(`market actions align at ${width}px in ${theme}`, async ({ page }) => {
    await mockApplication(page);
    await page.addInitScript(({ theme, language }) => {
      localStorage.setItem("lfb-theme", theme);
      localStorage.setItem("lfb-language", language);
    }, { theme, language });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/market");
    await expect(page.locator(".market-data-row").first()).toBeVisible();
    const actions = page.locator(".market-section-actions > button");
    await expect(actions).toHaveCount(3);
    const boxes = await actions.evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return { y: rect.y, height: rect.height, width: rect.width, scroll: button.scrollWidth, client: button.clientWidth };
    }));
    for (const box of boxes) {
      expect(box.y).toBeCloseTo(boxes[0].y, 0);
      expect(box.height).toBeCloseTo(boxes[0].height, 0);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.scroll).toBeLessThanOrEqual(box.client);
    }
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    await page.screenshot({ path: `/tmp/lfb-market-toolbar-${width}.png` });
    await actions.nth(2).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(actions.nth(2)).toBeFocused();
  });
}
