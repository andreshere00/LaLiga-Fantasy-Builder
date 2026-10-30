import { test, expect } from "@playwright/test";
import { mockApplication } from "./fixtures";

for (const theme of ["light", "dark"]) {
  for (const width of [320, 1024, 1440]) {
    test(`squad pagination frame and navigation ${theme} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await mockApplication(page);
      await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
      await page.goto("/");
      const pager = page.locator(".squad-pager .pager");
      const previous = pager.getByRole("button", { name: "Previous squad page" });
      const next = pager.getByRole("button", { name: "Next squad page" });
      await expect(pager).toBeVisible();
      await pager.screenshot({ path: info.outputPath("first-page.png") });

      const expectFrameContainsControls = async () => {
        const layout = await pager.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const css = getComputedStyle(element);
          return {
            inner: {
              left: bounds.left + parseFloat(css.borderLeftWidth),
              top: bounds.top + parseFloat(css.borderTopWidth),
              right: bounds.right - parseFloat(css.borderRightWidth),
              bottom: bounds.bottom - parseFloat(css.borderBottomWidth),
            },
            children: Array.from(element.children).map((child) => {
              const rect = child.getBoundingClientRect();
              return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
            }),
          };
        });
        for (const child of layout.children) {
          expect(child.left).toBeGreaterThanOrEqual(layout.inner.left - 0.1);
          expect(child.right).toBeLessThanOrEqual(layout.inner.right + 0.1);
          expect(child.top).toBeGreaterThanOrEqual(layout.inner.top - 0.1);
          expect(child.bottom).toBeLessThanOrEqual(layout.inner.bottom + 0.1);
        }
        for (const button of [previous, next]) {
          const bounds = (await button.boundingBox())!;
          expect(bounds.width).toBeGreaterThanOrEqual(44);
          expect(bounds.height).toBeGreaterThanOrEqual(44);
        }
      };

      await expectFrameContainsControls();
      await expect(previous).toBeDisabled();
      await expect(next).toBeEnabled();
      await next.focus();
      await expect(next).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(pager.locator("span")).toHaveText("2");
      await expect(previous).toBeEnabled();
      await next.hover();
      await expectFrameContainsControls();
      await pager.screenshot({ path: info.outputPath("next-page.png") });
      await previous.click();
      await expect(pager.locator("span")).toHaveText("1");
      await expect(previous).toBeDisabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
