import { expect, test } from "@playwright/test";
import { mockApplication, mockScouting } from "./fixtures";

for (const [theme, width] of [["light", 1440], ["dark", 375]] as const) {
  test(`favorites sync, accessible sheet and detail return: ${theme}`, async ({ page }) => {
    await mockApplication(page);
    await page.addInitScript(theme => {
      localStorage.setItem("lfb-theme", theme);
      localStorage.setItem("lfb-language", "en");
    }, theme);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/market");
    const bookmark = page.getByRole("button", { name: "Favorite Player 14", exact: true });
    await bookmark.click();
    await expect(bookmark).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.fb-toast[data-tone="success"]')).toHaveText(/Player added to favorites\./);
    await page.screenshot({ path: `/tmp/lfb-favorite-confirmation-${theme}.png` });
    await expect(page.locator(".market-data-row").filter({ has: bookmark }).locator(".player-tile"))
      .toHaveCSS("background-color", "rgb(255, 194, 191)");
    await expect(page.locator(".market-name-wrap").filter({ has: bookmark })).toBeVisible();
    await page.getByRole("button", { name: "Favorites (1)", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Favorites and scouting" });
    await expect(dialog).toBeVisible();
    const settings = dialog.getByRole("button", { name: /Alerts in this league/ });
    await expect(settings).toHaveAttribute("aria-expanded", "false");
    await expect(settings).toContainText("Market and clause");
    await expect(dialog.getByRole("img", { name: "Last performances: 0, 0, 6, 6, 6 points" })).toBeVisible();
    await page.screenshot({ path: `/tmp/lfb-scouting-${theme}.png` });
    await settings.focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("checkbox", { name: "When listed on the market" })).toBeChecked();
    await dialog.getByRole("combobox", { name: "Advance warning" }).selectOption("6");
    await expect(dialog.getByRole("combobox", { name: "Advance warning" })).toHaveValue("6");
    await expect(dialog.getByRole("combobox", { name: "Advance warning" })).toBeEnabled();
    await expect(settings).toHaveAttribute("aria-expanded", "true");
    await expect(settings).toContainText("6 hours");
    await dialog.getByRole("combobox", { name: "Advance warning" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/lfb-scouting-${theme}-settings.png` });
    await expect(dialog).toHaveJSProperty("scrollWidth", await dialog.evaluate(el => el.clientWidth));
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Favorites (1)", exact: true })).toBeFocused();
    await page.goto("/players");
    await page.getByRole("button", { name: "Favorites (1)", exact: true }).click();
    await dialog.getByRole("searchbox", { name: "Search favorites" }).fill("Player 14");
    await dialog.getByRole("button", { name: "Player details", exact: true }).click();
    await expect(page).toHaveURL(/\/players\/14$/);
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Players", exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("searchbox", { name: "Search favorites" })).toHaveValue("Player 14");
    await dialog.getByRole("button", { name: "Favorite Player 14", exact: true }).click();
    await expect(dialog.getByText("Save players with the bookmark button to follow them here.")).toBeVisible();
    await expect(page.locator('.fb-toast[data-tone="success"]', { hasText: "Player removed from favorites." })).toBeVisible();
  });
}

test("legacy import keeps alerts off and partial activation preserves the favorite", async ({ page }) => {
  await mockApplication(page);
  const fixture = await mockScouting(page);
  await page.addInitScript(() => localStorage.setItem("lfb-player-favorites:demo", '["1"]'));
  await page.goto("/players");
  await page.getByRole("button", { name: "Favorites (1)", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Favorites and scouting" });
  await dialog.getByRole("button", { name: /Alerts in this league/ }).click();
  await expect(dialog.getByRole("checkbox", { name: "When listed on the market" })).not.toBeChecked();
  expect(fixture.favorites.get("1")?.watch).toBeNull();
  await page.keyboard.press("Escape");
  fixture.setFailWatch(true);
  await page.getByRole("button", { name: "Favorite Player 02", exact: true }).click();
  await expect(page.getByRole("button", { name: "Favorite Player 02", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Notifications" }).getByText("Favorite saved; alerts could not be activated. Retry in Favorites.")).toBeVisible();
  await expect(page.locator('.fb-toast[data-tone="success"]')).toHaveCount(0);
});

test("favorite confirmation waits for persistence and failures allow retry in Spanish", async ({ page }) => {
  await mockApplication(page);
  await page.addInitScript(() => localStorage.setItem("lfb-language", "es"));
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/scouting/favorites/14", async route => {
    await pending;
    await route.fulfill({ status: 502, json: { error: "upstream_error" } });
  });
  await page.goto("/market");
  const bookmark = page.getByRole("button", { name: "Marcar como favorito a Player 14", exact: true });
  await bookmark.focus();
  await page.keyboard.press("Enter");
  await expect(bookmark).toBeDisabled();
  await expect(page.locator('.fb-toast[data-tone="success"]')).toHaveCount(0);
  release();
  await expect(page.locator('.fb-toast[data-tone="error"]')).toContainText("No se pudieron guardar los favoritos.");
  await expect(bookmark).toHaveAttribute("aria-pressed", "false");
  await expect(bookmark).toBeEnabled();
  await expect(page.locator('.fb-toast[data-tone="success"]')).toHaveCount(0);
  await page.unroute("**/api/scouting/favorites/14");
  await bookmark.click();
  await expect(bookmark).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.fb-toast[data-tone="success"]')).toContainText("Jugador añadido a favoritos.");
  await bookmark.click();
  await expect(bookmark).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('.fb-toast[data-tone="success"]', { hasText: "Jugador eliminado de favoritos." })).toBeVisible();
});

test("inbox stays unread until explicitly opened or marked", async ({ page }) => {
  await mockApplication(page);
  const fixture = await mockScouting(page);
  fixture.alerts.push({ id: "1", playerId: "1", playerName: "Player 01", leagueId: "l1", leagueName: "Demo League",
    kind: "market", createdAt: "2026-10-12T12:00:00Z", readAt: null });
  await page.goto("/market?scouting=alerts");
  const dialog = page.getByRole("dialog", { name: "Favorites and scouting" });
  await expect(dialog.getByRole("button", { name: "Alerts (1)", exact: true })).toBeVisible();
  expect(fixture.alerts[0].readAt).toBeNull();
  await dialog.getByRole("button", { name: "Mark as read" }).click();
  await expect(dialog.getByRole("button", { name: "Alerts (0)", exact: true })).toBeVisible();
  expect(fixture.alerts[0].readAt).not.toBeNull();
});

test("alert settings keep confirmed values after a failure and allow retry", async ({ page }) => {
  await mockApplication(page);
  const fixture = await mockScouting(page);
  fixture.favorites.set("14", { playerId: "14", createdAt: "2026-10-12T12:00:00Z",
    watch: { marketAlert: true, clauseAlert: true, leadHours: 6 }, observation: null });
  await page.goto("/players?scouting=favorites");
  const dialog = page.getByRole("dialog", { name: "Favorites and scouting" });
  const settings = dialog.getByRole("button", { name: /Alerts in this league/ });
  await settings.click();
  const clause = dialog.getByRole("checkbox", { name: "Before and when the clause unlocks" });
  fixture.setFailWatch(true);
  await clause.click();
  await expect(dialog.getByRole("alert")).toHaveText("Alert preferences could not be saved. Try again.");
  await expect(clause).toBeChecked();
  await expect(settings).toContainText("Market and clause · 6 hours");
  fixture.setFailWatch(false);
  await clause.click();
  await expect(clause).not.toBeChecked();
  await expect(settings).toContainText("Market only");
  await expect(dialog.getByRole("combobox", { name: "Advance warning" })).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await clause.click();
  await expect(dialog.getByRole("combobox", { name: "Advance warning" })).toHaveValue("6");
});

for (const [theme, width] of [["light", 320], ["dark", 1440]] as const) {
  test(`confirmed data, Spanish and long owner names reflow: ${theme}`, async ({ page }) => {
    await mockApplication(page);
    const fixture = await mockScouting(page);
    await page.addInitScript(theme => {
      localStorage.setItem("lfb-theme", theme);
      localStorage.setItem("lfb-language", "es");
    }, theme);
    await page.setViewportSize({ width, height: 900 });
    fixture.favorites.set("14", { playerId: "14", createdAt: "2026-10-12T12:00:00Z",
      watch: { marketAlert: true, clauseAlert: true, leadHours: 24 }, observation: {
        name: "Player 14", listings: ["official-listing"], ownerId: "rival", ownerName: "Un nombre de manager muy largo para comprobar el ajuste de línea",
        playerTeamId: "slot14", unlockAt: null, shielded: false, clause: 50416226,
        clauseEnabled: true, rival: true, available: true, checkedAt: "2026-10-12T12:00:00Z", cycle: "cycle", episode: "episode",
      } });
    await page.goto("/players?scouting=favorites");
    const dialog = page.getByRole("dialog", { name: "Favoritos y seguimiento" });
    await expect(dialog.getByRole("listitem").getByText("Cláusula disponible", { exact: true })).toBeVisible();
    await expect(dialog.getByText("50.416.226 €", { exact: true })).toBeVisible();
    await expect(dialog).toHaveJSProperty("scrollWidth", await dialog.evaluate(el => el.clientWidth));
    const body = dialog.locator(".fb-dialog-body");
    await expect(body).toHaveJSProperty("scrollWidth", await body.evaluate(el => el.clientWidth));
    await page.screenshot({ path: `/tmp/lfb-scouting-es-${theme}.png` });
    const settings = dialog.getByRole("button", { name: /Alertas en esta liga/ });
    await settings.click();
    const warning = dialog.getByRole("combobox", { name: "Antelación" });
    await warning.scrollIntoViewIfNeeded();
    await expect(warning).toBeVisible();
    await expect(body).toHaveJSProperty("scrollWidth", await body.evaluate(el => el.clientWidth));
    await expect(dialog.getByRole("button", { name: "Cerrar diálogo" })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Cerrar", exact: true })).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
}
