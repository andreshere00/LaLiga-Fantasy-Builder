import { test, expect } from "@playwright/test";
import { mockApplication } from "./fixtures";

const rule = (id: number, side: "sell" | "buy", state: string, playerName: string) => ({
  id, leagueId: "l1", side, target: "market", playerId: String(id), playerTeamId: side === "sell" ? `s${id}` : null,
  playerName, triggerKind: "relative", triggerPercent: 5, triggerAmount: null, baselineValue: 10_000_000,
  thresholdAmount: 10_500_000, priceMode: "threshold", bidAmount: null, maxSpend: side === "buy" ? 12_000_000 : null,
  state, armedAt: "2026-11-24T10:00:00Z", expiresAt: null, listedPrice: null, acceptFloor: null, listedAt: null,
  lastExecution: null,
});

for (const { theme, width } of [{ theme: "light", width: 1440 }, { theme: "dark", width: 375 }]) {
  test(`auto market separates selling and buying and collapses history: ${theme} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    await mockApplication(page);
    await page.route("**/api/auto-market/leagues/*/rules", (route) => route.fulfill({ json: {
      rules: [rule(1, "sell", "armed", "Seller One"), rule(2, "buy", "armed", "Buyer Two"),
        rule(3, "sell", "executed", "Done Three")],
      status: "active", checkedAt: null,
    } }));
    await page.goto("/market");
    await page.getByRole("button", { name: /^Market options/ }).click();
    await page.getByRole("menuitem", { name: /^Auto market, 2 active/ }).click();
    const sheet = page.getByRole("dialog", { name: "Auto market" });
    const selling = sheet.getByRole("tab", { name: "Selling (1)" });
    await expect(selling).toHaveAttribute("aria-selected", "true");
    await expect(sheet.getByText("Seller One")).toBeVisible();
    await expect(sheet.getByText("Buyer Two")).toHaveCount(0);
    await expect(sheet.getByText("Done Three")).not.toBeVisible();

    await selling.focus();
    await page.keyboard.press("ArrowRight");
    const buying = sheet.getByRole("tab", { name: "Buying (1)" });
    await expect(buying).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(buying).toHaveAttribute("aria-selected", "true");
    await expect(sheet.getByText("Buyer Two")).toBeVisible();

    await sheet.getByText("History (1)").click();
    await expect(sheet.getByText("Done Three")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await sheet.screenshot({ path: info.outputPath(`auto-market-${theme}-${width}.png`) });
  });
}
