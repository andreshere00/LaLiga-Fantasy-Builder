import { test, expect, type Page } from "@playwright/test";
import { catalog, marketFixture, mockMarketBids } from "./fixtures";

/** Reuses market mutation fixtures and supplies independent, league-specific rosters. */
async function mockPlayers(page: Page) {
  const fixture = await mockMarketBids(page);
  const players = catalog.map((player) => player.id === "5"
    ? { ...player, nickname: "Player Coach", positionId: 5 } : player);
  const own = { id: "t1", manager: { managerName: "Demo Manager" },
    teamValue: 80_000_000, playersNumber: 8,
    players: players.slice(5, 13).map((player) => ({ playerTeamId: `s${player.id}`,
      playerMaster: player, buyoutClause: 10_000_000,
      playerMarket: player.id === "13" ? { id: "own-listing", money: 3_000_000 } : null,
    })),
  };
  const other = { id: "t2", manager: { managerName: "Other Manager" }, players: [
    { playerTeamId: "unlisted-shield", playerMaster: players[0], buyoutClause: 10_000_000, isShielded: true },
    { playerTeamId: "unlisted-lock", playerMaster: players[1], buyoutClause: 8_000_000,
      buyoutClauseLockedEndTime: "2026-10-12T12:00:30Z" },
    { playerTeamId: "unknown-clause", playerMaster: players[2] },
    { playerTeamId: "coach-entry", playerMaster: players[4], buyoutClause: 50_000_000, isShielded: true },
    { playerTeamId: "opponent-0", playerMaster: players[13], buyoutClause: 12_000_000, isShielded: true },
    { playerTeamId: "opponent-1", playerMaster: players[14], buyoutClause: 12_000_000,
      buyoutClauseLockedEndTime: "2026-10-12T12:00:30Z" },
  ] };
  await page.route("**/api/players", (route) => route.fulfill({ json: players }));
  await page.route("**/api/leagues/l1/teams", (route) => route.fulfill({ json: [own, other] }));
  await page.route("**/api/leagues/l1/teams/t1", (route) => route.fulfill({ json: own }));
  await page.route("**/api/leagues/l1/teams/t2", (route) => route.fulfill({ json: other }));
  return { ...fixture, own, other };
}

const playerRow = (page: Page, name: string) => page.locator(".players-row").filter({
  has: page.locator(".market-name").getByText(name, { exact: true }),
});

for (const theme of ["light", "dark"]) {
  for (const width of [375, 800, 1024, 1440, 720]) {
    test(`catalog market details and layout: ${theme} ${width}`, async ({ page }, info) => {
      await page.clock.install({ time: new Date("2026-10-12T12:00:00Z") });
      await mockPlayers(page);
      await page.setViewportSize({ width, height: width === 720 ? 500 : 1000 });
      await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
      await page.goto("/players?q=Player");
      const shielded = playerRow(page, "Player 01");
      const name = shielded.getByRole("link", { name: "Player 01", exact: true });
      await expect(name).toHaveCSS("font-weight", "700");
      await expect(name).toHaveCSS("color", "rgb(255, 75, 68)");
      await name.hover();
      await expect(name).toHaveCSS("color", "rgb(255, 75, 68)");
      const details = width <= 800 ? ".players-mobile-value-details" : ".players-value-details";
      await expect(shielded.locator(details).getByText("Release clause: 10.000.000 €", { exact: true })).toBeVisible();
      await expect(shielded.locator(details + " .market-clause-shield")).toHaveCSS("filter",
        theme === "dark" ? "brightness(0) invert(1)" : "none");
      await expect(shielded.locator(".market-clause-flag-icon")).toHaveCSS("filter", "none");
      await expect(shielded.locator(".market-bid-count")).toHaveCount(0);
      await expect(shielded.locator(".market-fsyp-primary")).toHaveCSS("font-size", "16px");
      await expect(shielded.locator(".market-fsyp-primary")).toHaveCSS("font-weight", "700");
      await expect(shielded.locator(".market-form-week")).toHaveText(["F3", "F4", "F5", "F6", "F7"]);
      if (width <= 800) await expect(shielded.locator(".market-fsyp-primary")).toBeHidden();
      if (width > 1000) {
        const squares = await shielded.locator(".market-form-badges").boundingBox();
        const cell = await shielded.locator(".market-form").boundingBox();
        expect(squares!.width).toBeLessThanOrEqual(cell!.width);
      }
      const coach = playerRow(page, "Player Coach");
      await expect(coach.locator(".market-name")).toHaveCSS("color", "rgb(255, 75, 68)");
      await expect(coach.getByRole("link", { name: "Player Coach" })).toHaveCount(0);
      await expect(playerRow(page, "Player 03").locator(details).getByText("Release clause: Unavailable", { exact: true })).toBeVisible();
      await expect(playerRow(page, "Player 04").locator(details).getByText("Release clause: Not applicable", { exact: true })).toBeVisible();
      const bid = playerRow(page, "Player 14");
      await expect(bid.locator(details).getByText("Your bid: 4.000.000 €", { exact: true })).toHaveCSS("color", "rgb(255, 75, 68)");
      await expect(bid.getByText("Bids: 2", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`players-${theme}-${width}.png`), fullPage: true });
      const locked = playerRow(page, "Player 02").getByRole("link", { name: "Player 02", exact: true });
      await expect(locked).toHaveCSS("color", "rgb(255, 75, 68)");
      await page.clock.setFixedTime(new Date("2026-10-12T12:01:00Z"));
      await page.clock.fastForward(60_000);
      await expect(locked).not.toHaveCSS("color", "rgb(255, 75, 68)");
      await expect(name).toHaveCSS("color", "rgb(255, 75, 68)");
      await shielded.locator(".market-clause-flag").focus();
      await expect(page.getByRole("tooltip")).toHaveText("Release clause protected");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toHaveCount(0);
    });
  }
}

test("catalog bid mutations reconcile amounts and counts, including stale reads and rejected cancellation", async ({ page }) => {
  const fixture = await mockPlayers(page);
  await page.goto("/players?q=Player+14");
  const row = playerRow(page, "Player 14");
  await row.getByRole("button", { name: "Bidded", exact: true }).click();
  await page.getByRole("menuitem", { name: "Modify bid", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Modify bid", exact: true });
  for (const button of await dialog.getByRole("button").all()) {
    await expect(button).toHaveCSS("border-radius", "0px");
  }
  await dialog.getByRole("textbox", { name: "Bid amount" }).fill("6000000");
  fixture.lag(2);
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row.locator(".players-value-details .market-bid-value")).toHaveText("Your bid: 6.000.000 €");
  await expect(row.getByText("Bids: 2", { exact: true })).toBeVisible();
  fixture.rejectCancellation(true);
  await row.getByRole("button", { name: "Bidded", exact: true }).click();
  await page.getByRole("menuitem", { name: "Cancel bid", exact: true }).click();
  await expect(page.locator(".players-page").getByRole("alert")).toBeVisible();
  await expect(row.getByText("Bids: 2", { exact: true })).toBeVisible();
  await expect(row.locator(".players-value-details .market-bid-value")).toHaveText("Your bid: 6.000.000 €");
  fixture.rejectCancellation(false);
  await row.getByRole("button", { name: "Bidded", exact: true }).click();
  await page.getByRole("menuitem", { name: "Cancel bid", exact: true }).click();
  await expect(row.locator(".market-bid-value")).toHaveCount(0);
  await expect(row.getByText("Bids: 1", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Search players" }).fill("Player 16");
  const unbid = playerRow(page, "Player 16");
  await unbid.getByRole("button", { name: "Options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Hire", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(unbid.getByText("Bids: 1", { exact: true })).toBeVisible();
  await expect(unbid.locator(".players-value-details .market-bid-value")).toHaveText("Your bid: 3.500.000 €");
  expect(fixture.writes.map(({ method }) => method)).toEqual(["PUT", "DELETE", "DELETE", "POST"]);
});

test("catalog preserves pagination, favorites, URL filters and player-specific offers", async ({ page }) => {
  await mockPlayers(page);
  await page.goto("/players");
  await expect(page.locator(".players-row")).toHaveCount(10);
  await page.getByRole("combobox", { name: "Search players" }).fill("Player");
  await expect(page.locator(".players-row")).toHaveCount(15);
  const favorite = playerRow(page, "Player 01").getByRole("button", { name: "Favorite Player 01" });
  await favorite.click();
  await page.getByRole("navigation", { name: "Players pages" }).getByRole("button", { name: "Page 2", exact: true }).click();
  await expect(playerRow(page, "Player 16").getByText("Bids: 0", { exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Players pages" }).getByRole("button", { name: "Page 1", exact: true }).click();
  await expect(playerRow(page, "Player 01").getByRole("button", { name: "Remove Player 01 from favorites" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("combobox", { name: "Search players" }).fill("Player 13");
  await expect(page).toHaveURL(/q=Player\+13/);
  const own = playerRow(page, "Player 13");
  await own.getByRole("button", { name: "Player 13, options", exact: true }).click();
  await page.getByRole("menuitem", { name: "View offers for this player", exact: true }).click();
  const offers = page.getByRole("dialog", { name: "Player 13 offers", exact: true });
  await expect(offers.getByText("No pending offers for Player 13.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(own.getByRole("button", { name: "Player 13, options", exact: true })).toBeFocused();
});

test("catalog keeps roster clauses when market fails and distinguishes unknown bid counts", async ({ page }) => {
  const fixture = await mockPlayers(page);
  fixture.failRead(true);
  await page.goto("/players?q=Player+01");
  await expect(playerRow(page, "Player 01").getByText("Release clause: 10.000.000 €", { exact: true }).first()).toBeVisible();
  await expect(playerRow(page, "Player 01").locator(".market-bid-count")).toHaveCount(0);
  await page.route("**/api/market/leagues/l1", (route) => route.fulfill({ json: marketFixture }));
  await page.goto("/players?q=Player+16");
  await expect(playerRow(page, "Player 16").getByText("Bids: Unavailable", { exact: true })).toBeVisible();
});

test("catalog resets clause ownership and dialog state when switching leagues", async ({ page }) => {
  await mockPlayers(page);
  await page.route("**/api/leagues", (route) => route.fulfill({ json: [
    { id: "l1", name: "Demo League", team: { id: "t1", money: 50_000_000 } },
    { id: "l2", name: "Other League", team: { id: "t3", money: 10_000_000 } },
  ] }));
  const otherTeam = { id: "t3", manager: { managerName: "New Owner" }, players: [
    { playerTeamId: "new-entry", playerMaster: catalog[0], buyoutClause: 3_000_000, isShielded: false },
  ] };
  await page.route("**/api/leagues/l2/teams", (route) => route.fulfill({ json: [otherTeam] }));
  await page.route("**/api/leagues/l2/teams/t3", (route) => route.fulfill({ json: otherTeam }));
  await page.route("**/api/market/leagues/l2", (route) => route.fulfill({ json: { marketPlayers: [], userBids: [] } }));
  await page.goto("/players?q=Player+01");
  const row = playerRow(page, "Player 01");
  await expect(row.getByRole("link", { name: "Player 01", exact: true })).toHaveCSS("color", "rgb(255, 75, 68)");
  await page.getByRole("combobox", { name: "League", exact: true }).click();
  await page.getByRole("option", { name: "Other League", exact: true }).click();
  await expect(row.locator(".players-value-details").getByText("Release clause: 3.000.000 €", { exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: "Player 01", exact: true })).not.toHaveCSS("color", "rgb(255, 75, 68)");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
