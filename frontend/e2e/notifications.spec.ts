import { expect, test } from "@playwright/test";
import { mockApplication } from "./fixtures";

for (const [width, theme, touch] of [[375, "light", true], [1440, "dark", false]] as const) {
  test(`stacked urgent notifications dismiss with pointer and keyboard: ${theme}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch });
    const page = await context.newPage();
    await mockApplication(page);
    await page.addInitScript(theme => {
      localStorage.setItem("lfb-theme", theme);
      localStorage.setItem("lfb-language", "en");
    }, theme);
    await page.goto("http://127.0.0.1:3100/market");
    await expect(page.locator(".market-data-row").first()).toBeVisible();
    await page.evaluate(`import('/src/components/ui/Notifications.tsx').then(({notify}) => {
      notify("There have been many changes to the player's purchase status. Please refresh the page and try again", "error");
      notify("The action could not be completed.", "error");
    })`);
    const toasts = page.locator(".fb-toast");
    await expect(toasts).toHaveCount(2);
    await page.screenshot({ path: `/tmp/lfb-notifications-${theme}.png` });
    for (const toast of await toasts.all()) {
      await expect(toast).toHaveJSProperty("scrollWidth", await toast.evaluate(el => el.clientWidth));
      const close = toast.locator("button");
      const box = await close.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    const firstClose = toasts.first().locator("button");
    if (touch) await firstClose.tap(); else await firstClose.click();
    await expect(toasts).toHaveCount(1);
    await page.keyboard.press("F6");
    await page.keyboard.press("Tab");
    // The toast root itself is focusable before its close control.
    if (await toasts.locator("button").evaluate(el => el !== document.activeElement)) await page.keyboard.press("Tab");
    await expect(toasts.locator("button")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(toasts).toHaveCount(0);
    await page.getByRole("button", { name: "Favorites (0)", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Favorites and scouting" })).toBeVisible();
    await context.close();
  });
}
