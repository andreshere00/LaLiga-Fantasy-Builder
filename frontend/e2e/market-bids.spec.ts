import { test, expect, type Page } from "@playwright/test";
import { catalog, mockMarketBids } from "./fixtures";

async function summaryValue(page: Page, label: string) {
  const trigger = page.getByRole("button", { name: /Show balance details/ });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  return page.getByRole("dialog", { name: "Balance details", exact: true })
    .locator("dl > div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd");
}
const bidTrigger = (page: Page, count = 3) => page.getByRole("button", { name: `My bids, ${count} active`, exact: true, includeHidden: true });

test("filtering preserves all commitments; modifying and cancelling reconcile every view", async ({ page }) => {
  const fixture = await mockMarketBids(page);
  await page.goto("/market");
  await expect(await summaryValue(page, "Projected spending")).toHaveText("11.000.000 €");
  await expect(await summaryValue(page, "Estimated available")).toHaveText("39.000.000 €");
  await page.getByRole("combobox", { name: "Search market" }).fill("No match");
  await expect(page.locator(".market-data-row")).toHaveCount(0);
  await expect(await summaryValue(page, "Projected spending")).toHaveText("11.000.000 €");
  await bidTrigger(page).click();
  const panel = page.getByRole("dialog", { name: "My bids", exact: true });
  await expect(panel.getByRole("listitem")).toHaveCount(3);
  await expect(panel.getByRole("heading", { name: "Player 22", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Modify bid for Player 14", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Modify bid", exact: true });
  await expect(panel).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Bid amount" }).fill("6000000");
  fixture.lag(2);
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(bidTrigger(page)).toBeFocused();
  await expect(await summaryValue(page, "Projected spending")).toHaveText("13.000.000 €");
  await expect(page.getByText(/Refreshing balance and bids/).first()).toBeVisible();
  await page.getByRole("combobox", { name: "Search market" }).fill("");
  await expect(page.locator(".market-data-row .market-value").getByText("Your bid: 6.000.000 €", { exact: true })).toBeVisible();
  await bidTrigger(page).click();
  await expect(panel.getByRole("button", { name: "Cancel bid for Player 14", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Cancel bid for Player 14", exact: true }).click();
  await expect(bidTrigger(page, 2)).toBeVisible();
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await expect(panel.getByRole("button", { name: "Refresh bids", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(bidTrigger(page, 2)).toBeFocused();
  await expect(await summaryValue(page, "Projected spending")).toHaveText("7.000.000 €");
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Search market" }).fill("");
  await expect(page.getByRole("combobox", { name: "Search market" })).toHaveValue("");
  await page.getByRole("combobox", { name: "Search market" }).press("Tab");
  const row = page.locator(".market-data-row").filter({ has: page.getByRole("link", { name: "Player 14", exact: true }) });
  await expect(row.getByText("Bids: 1", { exact: true })).toBeVisible();
  await expect(row.locator(".market-bid-value")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Options", exact: true })).toBeVisible();
  expect(fixture.writes.map(({ method }) => method)).toEqual(["PUT", "DELETE"]);
});

test("failed cancellation restores rows, count and spending; failed refresh retains usable bids", async ({ page }) => {
  const fixture = await mockMarketBids(page);
  fixture.rejectCancellation(true);
  await page.goto("/market");
  await bidTrigger(page).click();
  const panel = page.getByRole("dialog", { name: "My bids", exact: true });
  await panel.getByRole("button", { name: "Cancel bid for Player 14", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Player 14", exact: true })).toBeVisible();
  await expect(panel.locator(".market-bids-total strong")).toHaveText("11.000.000 €");
  await expect(bidTrigger(page)).toBeVisible();
  fixture.failRead(true);
  await panel.getByRole("button", { name: "Refresh bids", exact: true }).click();
  await expect(panel.getByText(/Cached bids may be stale/)).toBeVisible();
  await expect(panel.getByRole("listitem")).toHaveCount(3);
  await expect(page.locator(".market-data-row")).toHaveCount(7);
  fixture.failRead(false);
  await panel.getByRole("button", { name: "Refresh bids", exact: true }).click();
  await expect(panel.getByText(/Cached bids may be stale/)).toHaveCount(0);
});

test("league switching isolates bids, totals and dialog state", async ({ page }) => {
  await mockMarketBids(page);
  await page.route("**/api/leagues", (route) => route.fulfill({ json: [
    { id: "l1", name: "Demo League", team: { id: "t1", money: 50_000_000 } },
    { id: "l2", name: "Other League", team: { id: "t2", money: 10_000_000 } },
  ] }));
  await page.route("**/api/market/leagues/l2", (route) => route.fulfill({ json: { marketPlayers: [], userBids: [] } }));
  await page.goto("/market");
  await bidTrigger(page).click();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "League", exact: true }).click();
  await page.getByRole("option", { name: "Other League", exact: true }).click();
  await expect(await summaryValue(page, "Projected spending")).toHaveText("0 €");
  await bidTrigger(page, 0).click();
  await expect(page.getByText("No active bids.", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("listitem")).toHaveCount(0);
});

test("new bids update known counts once through delayed server confirmation", async ({ page }) => {
  const fixture = await mockMarketBids(page);
  fixture.lag(2);
  await page.goto("/market");
  const row = page.locator(".market-data-row").filter({ has: page.getByRole("link", { name: "Player 16", exact: true }) });
  await row.getByRole("button", { name: "Options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Hire", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(bidTrigger(page, 4)).toBeVisible();
  await expect(row.getByText("Bids: 1", { exact: true })).toBeVisible();
  await bidTrigger(page, 4).click();
  await expect(page.getByRole("button", { name: "Cancel bid for Player 16", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel bid for Player 16", exact: true })).toBeEnabled();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0].method).toBe("POST");
});

test("first load and incomplete bids stay visible without authorizing unavailable actions", async ({ page }) => {
  await mockMarketBids(page);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/market/leagues/l1", async (route) => {
    await gate;
    await route.fulfill({ json: { marketPlayers: [], userBids: [
      { id: "orphan", money: 2_000_000, status: "pending" },
      { id: "missing-amount", marketId: "missing", status: "pending" },
      { id: "unknown-status", marketId: "unknown", money: 3_000_000, status: "unverified" },
      { id: "terminal", status: "cancelled", money: 1 },
      { id: "expired", status: "pending", money: 1, expirationDate: "2026-10-11T12:00:00Z" },
    ] } });
  });
  await page.goto("/market");
  await page.getByRole("button", { name: "My bids, 0 active, incomplete", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "My bids", exact: true });
  await expect(panel.getByText("Loading bids…", { exact: true })).toBeVisible();
  release();
  await expect(panel.getByRole("listitem")).toHaveCount(3);
  await expect(panel.getByText(/Bid details are incomplete/)).toBeVisible();
  await expect(panel.getByText("2.000.000 €", { exact: true })).toBeVisible();
  await expect(panel.getByText("Unavailable", { exact: true })).toBeVisible();
  for (const button of await panel.getByRole("button", { name: /^(Modify|Cancel) bid for/ }).all()) {
    await expect(button).toBeDisabled();
  }
  await page.keyboard.press("Escape");
  await expect(await summaryValue(page, "Projected spending")).toHaveText("Unavailable");
});

test("modify waits for catalog metadata while cancellation stays available", async ({ page }) => {
  await mockMarketBids(page);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/players", async (route) => {
    await gate;
    await route.fulfill({ json: catalog });
  });
  await page.route("**/api/market/leagues/l1", (route) => route.fulfill({ json: {
    marketPlayers: [{ id: "m14", playerMaster: { id: "14", nickname: "Player 14" },
      expirationDate: "2026-10-13T15:00:00Z",
      bid: { id: "b14", status: "pending", money: 4_000_000 },
    }], userBids: [],
  } }));
  await page.goto("/market");
  await bidTrigger(page, 1).click();
  const panel = page.getByRole("dialog", { name: "My bids", exact: true });
  const modify = panel.getByRole("button", { name: "Modify bid for Player 14", exact: true });
  await expect(modify).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Cancel bid for Player 14", exact: true })).toBeEnabled();
  release();
  await expect(modify).toBeEnabled();
  await modify.click();
  const dialog = page.getByRole("dialog", { name: "Modify bid", exact: true });
  await expect(dialog.getByText(/Amount must be at least 3.300.000 €/)).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Bid amount" })).toHaveValue("4.000.000");
  await expect(dialog.getByRole("button", { name: "Confirm", exact: true })).toBeEnabled();
});

test("refresh bids recovers a failed catalog request", async ({ page }) => {
  await mockMarketBids(page);
  let failed = true;
  let catalogReads = 0;
  await page.route("**/api/players", (route) => {
    catalogReads++;
    return failed
      ? route.fulfill({ status: 502, json: { error: "unavailable" } })
      : route.fulfill({ json: catalog });
  });
  await page.goto("/market");
  const error = page.getByText("The market could not be loaded. Refresh bids to retry.");
  await expect(error).toBeVisible();
  const failedReads = catalogReads;
  failed = false;
  await bidTrigger(page).click();
  await page.getByRole("dialog", { name: "My bids", exact: true })
    .getByRole("button", { name: "Refresh bids", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Player 14", exact: true })).toBeVisible();
  await expect(error).toHaveCount(0);
  expect(catalogReads).toBe(failedReads + 1);
  await bidTrigger(page).click();
  const refresh = page.getByRole("dialog", { name: "My bids", exact: true })
    .getByRole("button", { name: "Refresh bids", exact: true });
  await expect(refresh).toBeEnabled();
  const refreshed = page.waitForResponse("**/api/market/leagues/l1");
  await refresh.click();
  await refreshed;
  await expect(refresh).toBeEnabled();
  expect(catalogReads).toBe(failedReads + 1);
});

test("a successful direct offer never creates a synthetic market bid", async ({ page }) => {
  await mockMarketBids(page);
  await page.route("**/api/market/leagues/l1", (route) => route.fulfill({ json: {
    marketPlayers: [{ id: "offer-listing", directOffer: true,
      playerMaster: { id: "21", nickname: "Offer Player", marketValue: 4_000_000 },
      playerTeam: { playerTeamId: "squad-entry", teamId: "t2" },
      sellerTeam: { id: "t2", manager: { managerName: "Other Manager" } },
    }], userBids: [],
  } }));
  let writes = 0;
  await page.route("**/api/market/leagues/l1/direct-offers", async (route) => {
    writes++;
    expect(route.request().postDataJSON()).toEqual({ playerId: "squad-entry", money: 4_000_000 });
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/market");
  await page.getByRole("button", { name: "Options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Purchase bid", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Make offer", exact: true });
  for (const button of await dialog.getByRole("button").all()) {
    await expect(button).toHaveCSS("border-radius", "0px");
  }
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(bidTrigger(page, 0)).toBeVisible();
  await expect(await summaryValue(page, "Projected spending")).toHaveText("0 €");
  expect(writes).toBe(1);
});

for (const theme of ["light", "dark"]) {
  for (const width of [375, 800, 1024, 1440, 720]) {
    test(`market presentation, focus and responsive layout: ${theme} ${width}`, async ({ page }, info) => {
      await page.clock.install({ time: new Date("2026-10-12T12:00:00Z") });
      await mockMarketBids(page);
      await page.setViewportSize({ width, height: width === 720 ? 500 : 1000 });
      await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
      await page.goto("/market");
      const protectedRow = page.locator(".market-data-row").filter({ has: page.getByRole("link", { name: "Player 14", exact: true }) });
      const name = protectedRow.getByRole("link", { name: "Player 14", exact: true });
      await expect(name).toHaveCSS("font-weight", "700");
      await expect(name).toHaveCSS("color", "rgb(255, 75, 68)");
      await name.hover();
      await expect(name).toHaveCSS("color", "rgb(255, 75, 68)");
      await expect(protectedRow.locator(".market-fsyp-primary")).toHaveCSS("font-weight", "700");
      await expect(protectedRow.locator(".market-fsyp-primary")).toHaveCSS("font-size", "16px");
      const form = protectedRow.locator(".market-form");
      await expect(form.locator(".market-form-week")).toHaveText(["F3", "F4", "F5", "F6", "F7"]);
      if (width > 860) {
        const badgesBox = await form.locator(".market-form-badges").boundingBox();
        const formBox = await form.boundingBox();
        expect(badgesBox!.width).toBeLessThanOrEqual(formBox!.width);
        await form.getByRole("button", { name: "Earlier matchweeks" }).click();
        await expect(form.locator(".market-form-week")).toHaveText(["F2", "F3", "F4", "F5", "F6"]);
        await form.getByRole("button", { name: "Later matchweeks" }).click();
        await expect(form.locator(".market-form-week")).toHaveText(["F3", "F4", "F5", "F6", "F7"]);
        await expect(form.getByRole("button", { name: "Later matchweeks" })).toBeDisabled();
      }
      await expect(protectedRow.getByText("Bids: 2", { exact: true })).toBeVisible();
      await expect(protectedRow.locator(".market-value .market-bid-value")).toHaveText("Your bid: 4.000.000 €");
      const unbidRow = page.locator(".market-data-row").filter({ has: page.getByRole("link", { name: "Player 16", exact: true }) });
      await expect(unbidRow.locator(".market-bid-value")).toHaveCount(0);
      const clause = protectedRow.locator(".market-value").getByText("Release clause: 12.000.000 €", { exact: true });
      await clause.scrollIntoViewIfNeeded();
      await expect(clause).toBeInViewport();
      await page.locator(".market-list").evaluate((element) => { element.scrollLeft = 0; });
      await expect(protectedRow.locator(".market-cell-seller .market-clause-detail")).toHaveCount(0);
      await expect(protectedRow.locator(".market-clause-shield")).toHaveCSS("filter", theme === "dark" ? "brightness(0) invert(1)" : "none");
      await expect(protectedRow.locator(".market-clause-flag-icon")).toHaveCSS("filter", "none");
      const summary = page.getByLabel("Market money summary");
      const toolbar = page.locator(".market-filter-row");
      const summaryBox = await summary.boundingBox();
      const toolbarBox = await toolbar.boundingBox();
      expect(Math.abs(summaryBox!.x + summaryBox!.width - toolbarBox!.x - toolbarBox!.width)).toBeLessThan(2);
      await expect(page.getByText(/Fantasy may already reserve this money/)).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`market-${theme}-${width}.png`), fullPage: true });
      const balanceTrigger = page.getByRole("button", { name: /Show balance details/ });
      const balanceBox = await balanceTrigger.boundingBox();
      const bidsBox = await bidTrigger(page).boundingBox();
      if (width > 600) expect(Math.abs(balanceBox!.y - bidsBox!.y)).toBeLessThan(2);
      await balanceTrigger.click();
      const balanceDetails = page.getByRole("dialog", { name: "Balance details", exact: true });
      await expect(balanceDetails.getByText("Projected spending", { exact: true })).toBeVisible();
      const balanceHelp = balanceDetails.getByRole("button", { name: "About available balance" });
      await page.keyboard.press("Tab");
      await expect(balanceHelp).toBeFocused();
      await expect(page.getByRole("tooltip")).toContainText("Fantasy may already reserve this money");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      if (await balanceDetails.isVisible()) await page.keyboard.press("Escape");
      await expect(balanceDetails).toHaveCount(0);
      await expect(balanceTrigger).toBeFocused();
      const lockedName = page.getByRole("link", { name: "Player 15", exact: true });
      await expect(lockedName).toHaveCSS("color", "rgb(255, 75, 68)");
      await page.clock.setFixedTime(new Date("2026-10-12T12:01:00Z"));
      await page.clock.fastForward(60_000);
      await expect(lockedName).not.toHaveCSS("color", "rgb(255, 75, 68)");
      await expect(name).toHaveCSS("color", "rgb(255, 75, 68)");
      await bidTrigger(page).click();
      const panel = page.getByRole("dialog", { name: "My bids", exact: true });
      await expect(panel.getByRole("listitem")).toHaveCount(3);
      await panel.getByRole("heading", { name: "My bids", exact: true }).hover();
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`my-bids-${theme}-${width}.png`) });
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press("Tab");
        await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(bidTrigger(page)).toBeFocused();
      await bidTrigger(page).click();
      await panel.getByRole("button", { name: "Modify bid for Player 14", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Modify bid", exact: true });
      await expect(dialog).toBeVisible();
      for (const button of await dialog.getByRole("button").all()) {
        await expect(button).toHaveCSS("border-radius", "0px");
      }
      await dialog.getByRole("textbox", { name: "Bid amount" }).fill("1");
      await expect(dialog.getByRole("button", { name: "Confirm", exact: true })).toBeDisabled();
      await expect(dialog.getByRole("button", { name: "Confirm", exact: true })).toHaveCSS("border-radius", "0px");
      await page.keyboard.press("Escape");
      await expect(bidTrigger(page)).toBeFocused();
      await page.goto("/players?q=Player");
      await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
      await expect(page.locator(".market-name").first()).toHaveCSS("font-weight", "700");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
