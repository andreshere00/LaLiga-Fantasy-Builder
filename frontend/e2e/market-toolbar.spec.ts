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
    const bookmarks = page.locator(".market-name-wrap .player-bookmark-btn");
    for (const identity of await page.locator(".market-name-wrap").all()) {
      const bookmark = await identity.locator(".player-bookmark-btn").boundingBox();
      const name = await identity.locator(".market-name").boundingBox();
      if (width > 400) expect(bookmark!.x + bookmark!.width).toBeLessThanOrEqual(name!.x);
      else expect(name!.y).toBeGreaterThanOrEqual(bookmark!.y + bookmark!.height);
    }
    const bookmarkPositions = await bookmarks.evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().right));
    for (const right of bookmarkPositions) expect(right).toBeCloseTo(bookmarkPositions[0], 0);
    const actions = page.locator(".market-section-actions > button");
    await expect(actions).toHaveCount(3);
    const boxes = await actions.evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return { y: rect.y, height: rect.height, width: rect.width, scroll: button.scrollWidth, client: button.clientWidth };
    }));
    for (const box of boxes) {
      if (width > 380) expect(box.y).toBeCloseTo(boxes[0].y, 0);
      expect(box.height).toBeCloseTo(boxes[0].height, 0);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.scroll).toBeLessThanOrEqual(box.client);
    }
    const labelLines = await actions.first().locator("span").last().evaluate(label => {
      const range = document.createRange();
      range.selectNodeContents(label);
      return new Set(Array.from(range.getClientRects(), rect => Math.round(rect.y))).size;
    });
    expect(labelLines).toBe(1);
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    await page.screenshot({ path: `/tmp/lfb-market-toolbar-${width}.png` });
    await actions.nth(2).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(actions.nth(2)).toBeFocused();
  });
}
