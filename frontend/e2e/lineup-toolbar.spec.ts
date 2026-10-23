import { test, expect } from "@playwright/test";
import { mockApplication } from "./fixtures";

for (const theme of ["light", "dark"]) {
  for (const width of [320, 1024, 1440]) {
    test(`lineup toolbar centers its contents ${theme} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await mockApplication(page);
      await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
      await page.goto("/");
      const toolbar = page.locator(".board-controls-bar");
      await expect(toolbar.getByRole("button", { name: "Lineup builder" })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(toolbar.locator("h1")).toHaveCSS("text-align", "center");
      for (const block of await toolbar.locator(".control-block").all()) {
        const label = block.locator(".field-label");
        await expect(label).toHaveCSS("text-align", "center");
        const labelBox = (await label.boundingBox())!;
        const controlBox = (await block.locator(".pager, .score-pill, .lineup-formation-trigger, .recommend-button, .save-lineup-button, .value-box").boundingBox())!;
        expect(Math.abs(labelBox.x + labelBox.width / 2 - controlBox.x - controlBox.width / 2)).toBeLessThan(2);
      }
      for (const selector of [".recommend-button", ".save-lineup-button", ".lineup-formation-trigger"]) {
        const control = toolbar.locator(selector);
        const offset = await control.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const children = Array.from(element.children).map((child) => child.getBoundingClientRect());
          const left = Math.min(...children.map((child) => child.left));
          const right = Math.max(...children.map((child) => child.right));
          return Math.abs((left + right) / 2 - (bounds.left + bounds.right) / 2);
        });
        expect(offset).toBeLessThan(2);
      }
      const bounds = (await toolbar.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await toolbar.screenshot({ path: info.outputPath("toolbar.png") });
    });
  }
}
