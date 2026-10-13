import { test, expect, type Page } from "@playwright/test";
import { mockApplication } from "./fixtures";

/** These synthetic offers exercise the contract; no real account or writes are used. */
async function mockOffers(page: Page) {
  await mockApplication(page);
  let offers = [
    { id: "league-offer", isFromMarket: true, money: 3200000, status: "pending",
      expirationDate: "2026-10-14T12:00:00Z" },
    { id: "opponent-offer", bidderName: "Another Manager", bidderId: "manager-2",
      money: 3400000, status: "pending" },
  ];
  await page.route("**/api/market/leagues/l1/player-teams/*/offers", (route) =>
    route.fulfill({ json: { offers: route.request().url().includes("/s13/") ? offers : [] } }));
  return { remove: (id: string) => { offers = offers.filter((offer) => offer.id !== id); } };
}

for (const theme of ["light", "dark"]) {
  test(`offer countdown updates and the clock turns red at one hour in ${theme} theme`, async ({ page }, info) => {
    await page.clock.install({ time: new Date("2026-10-12T12:00:00Z") });
    await mockApplication(page);
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    await page.route("**/api/market/leagues/l1/player-teams/s13/offers", (route) =>
      route.fulfill({ json: { offers: [
        { id: "normal", money: 3200000, status: "pending", isFromMarket: true,
          expirationDate: "2026-10-12T13:01:00Z" },
        { id: "soon", money: 3300000, status: "pending", bidderName: "Soon",
          expirationDate: "2026-10-12T12:00:30Z" },
        { id: "unknown", money: 3400000, status: "pending", bidderName: "Unknown" },
      ] } }));
    await page.goto("/market");
    await page.getByRole("button", { name: "Market offers, 3 pending", exact: true }).click();
    const normal = page.locator(".market-offer").filter({ hasText: "LaLiga" });
    const soon = page.locator(".market-offer").filter({ hasText: "Soon" });
    const unknown = page.locator(".market-offer").filter({ hasText: "Unknown" });
    await expect(normal.locator(".market-offer-expiry")).toHaveText("Time left: 1h 1m");
    await expect(normal.locator(".market-offer-expiry img")).toHaveAttribute("src", /stroke='black'/);
    await expect(soon.locator(".market-offer-expiry")).toHaveText("Time left: <1m");
    await expect(soon.locator(".market-offer-expiry")).toHaveClass(/is-urgent/);
    await expect(soon.locator(".market-offer-expiry img")).toHaveAttribute("src", /stroke='%23FF4B44'/);
    await expect(unknown.locator(".market-offer-expiry")).toHaveText("Time left unavailable");
    await expect(unknown.locator(".market-offer-expiry")).toHaveClass(/is-unknown/);
    if (theme === "dark") await expect(normal.locator(".market-offer-expiry img")).toHaveCSS("filter", "invert(1)");
    await page.screenshot({ path: info.outputPath(`offer-countdown-${theme}.png`) });
    await page.clock.setFixedTime(new Date("2026-10-12T12:01:00Z"));
    await page.clock.fastForward(60_000);
    await expect(normal.locator(".market-offer-expiry")).toHaveText("Time left: 1h 0m");
    await expect(normal.locator(".market-offer-expiry")).toHaveClass(/is-urgent/);
    await expect(normal.locator(".market-offer-expiry img")).toHaveAttribute("src", /stroke='%23FF4B44'/);
    await expect(normal.locator(".market-offer-expiry img")).toHaveCSS("filter", "none");
    await expect(soon).toHaveCount(0);
  });

  test(`notification turns red as offers arrive asynchronously in ${theme} theme`, async ({ page }) => {
    await mockApplication(page);
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    let releaseOffers: () => void = () => {};
    let releaseOtherReads: () => void = () => {};
    const offersGate = new Promise<void>((resolve) => { releaseOffers = resolve; });
    const otherGate = new Promise<void>((resolve) => { releaseOtherReads = resolve; });
    let hasOffer = true;
    await page.route("**/api/market/leagues/l1/player-teams/s13/offers", async (route) => {
      await offersGate;
      await route.fulfill({ json: { offers: hasOffer ? [
        { id: "league-offer", isFromMarket: true, money: 3200000, status: "pending" },
      ] : [] } });
    });
    await page.route("**/api/market/leagues/l1/player-teams/s1/offers", async (route) => {
      await otherGate;
      await route.fulfill({ json: { offers: [] } });
    });
    await page.goto("/market");
    await expect(page.getByRole("heading", { name: "Market", exact: true })).toBeVisible();
    await expect(page.locator(".market-data-row")).toHaveCount(7);
    const trigger = page.locator(".market-offers-trigger");
    await expect(trigger).not.toHaveClass(/has-offers/);
    releaseOffers();
    await expect(trigger).toHaveAttribute("aria-label", "Market offers, 1 pending");
    await expect(trigger).toHaveCSS("background-color", "rgb(255, 75, 68)");
    await expect(trigger).toHaveCSS("color", "rgb(0, 0, 0)");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    releaseOtherReads();
    await trigger.click();
    hasOffer = false;
    await page.getByRole("button", { name: "Refresh offers", exact: true }).click();
    await expect(trigger).not.toHaveClass(/has-offers/);
    await expect(page.getByText("No pending offers.", { exact: true })).toBeVisible();
  });
}

for (const width of [375, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`offers panel ${theme} ${width}: keyboard focus and dismissal`, async ({ page }, info) => {
      await mockOffers(page);
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
      await page.goto("/market");
      const trigger = page.getByRole("button", { name: "Market offers, 2 pending", exact: true });
      await trigger.click();
      const panel = page.getByRole("dialog", { name: "Market offers", exact: true });
      await expect(panel.getByText("LaLiga", { exact: true })).toBeVisible();
      await expect(panel.getByText("Another Manager", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press("Tab");
        await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
      }
      await page.screenshot({ path: info.outputPath(`offers-${theme}-${width}.png`) });
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await panel.getByRole("button", { name: "Close dialog", exact: true }).click();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await panel.getByRole("button", { name: "Close", exact: true }).click();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.mouse.click(10, 130);
      await expect(panel).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }
}

test("acceptance requires confirmation, sends exact offer amount once and refreshes count", async ({ page }) => {
  const fixture = await mockOffers(page);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let writes = 0;
  await page.route("**/api/market/leagues/l1/own-listing/offers/league-offer/accept", async (route) => {
    writes += 1;
    expect(route.request().postDataJSON()).toEqual({ offerMoney: 3200000 });
    expect(route.request().headers().authorization).toBe("Bearer fixture-token");
    await gate;
    fixture.remove("league-offer");
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/market");
  const trigger = page.getByRole("button", { name: "Market offers, 2 pending", exact: true });
  await trigger.click();
  const accept = page.getByRole("button", { name: "Accept offer for Player 13 from LaLiga", exact: true });
  await accept.click();
  await expect(page.getByRole("group", { name: "Confirm acceptance" })).toBeVisible();
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(accept).toBeFocused();
  await accept.click();
  await page.getByRole("button", { name: "Confirm sale", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sending…", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reject offer for Player 13 from Another Manager", exact: true })).toBeDisabled();
  await expect(page.locator(".fb-toast")).toHaveCount(0);
  release();
  await expect(page.locator(".fb-toast").getByText("Offer accepted", { exact: true })).toBeVisible();
  await expect(page.locator(".market-offers-trigger")).toHaveAttribute("aria-label", "Market offers, 1 pending");
  await expect(accept).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh offers", exact: true })).toBeFocused();
  expect(writes).toBe(1);
});

test("rejection uses the offer endpoint without a body", async ({ page }) => {
  const fixture = await mockOffers(page);
  await page.route("**/api/market/leagues/l1/own-listing/offers/opponent-offer/reject", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postData()).toBeNull();
    fixture.remove("opponent-offer");
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/market");
  await page.getByRole("button", { name: "Market offers, 2 pending", exact: true }).click();
  await page.getByRole("button", { name: "Reject offer for Player 13 from Another Manager", exact: true }).click();
  await expect(page.locator(".fb-toast").getByText("Offer rejected", { exact: true })).toBeVisible();
  await expect(page.locator(".market-offers-trigger")).toHaveAttribute("aria-label", "Market offers, 1 pending");
});

test("a failed read shows a partial list and can be retried", async ({ page }) => {
  await mockOffers(page);
  let failed = true;
  await page.route("**/api/market/leagues/l1/player-teams/s1/offers", (route) =>
    failed ? route.fulfill({ status: 502, json: { error: "fantasy_error" } })
      : route.fulfill({ json: { offers: [] } }));
  await page.goto("/market");
  await page.getByRole("button", { name: /Market offers, 2 pending/ }).click();
  await expect(page.getByText("Some offers could not be loaded. The list and count may be incomplete.")).toBeVisible();
  await expect(page.getByText("Another Manager", { exact: true })).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Refresh offers", exact: true }).click();
  await expect(page.getByText("Some offers could not be loaded. The list and count may be incomplete.")).toHaveCount(0);
});

test("an unusable successful write refreshes state without retrying the write", async ({ page }) => {
  const fixture = await mockOffers(page);
  let writes = 0;
  await page.route("**/api/market/leagues/l1/own-listing/offers/opponent-offer/reject", async (route) => {
    writes += 1;
    fixture.remove("opponent-offer");
    await route.fulfill({ body: "not-json", contentType: "application/json" });
  });
  await page.goto("/market");
  await page.getByRole("button", { name: "Market offers, 2 pending", exact: true }).click();
  await page.getByRole("button", { name: "Reject offer for Player 13 from Another Manager", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/The response could not be confirmed/)).toBeVisible();
  await expect(page.locator(".market-offers-trigger")).toHaveAttribute("aria-label", "Market offers, 1 pending");
  expect(writes).toBe(1);
});

test("empty offers remain accessible when the market is empty", async ({ page }) => {
  await mockApplication(page);
  await page.route("**/api/market/leagues/l1", (route) => route.fulfill({ json: { marketPlayers: [], userBids: [] } }));
  await page.goto("/market");
  await page.getByRole("button", { name: "Market offers", exact: true }).click();
  await expect(page.getByText("No pending offers.", { exact: true })).toBeVisible();
});

test("direct offers on unlisted squad players use their explicit market id", async ({ page }) => {
  await mockApplication(page);
  await page.route("**/api/market/leagues/l1/player-teams/s1/offers", (route) => route.fulfill({ json: {
    offers: [{ id: "direct-offer", marketId: "direct-listing", bidderName: "Another Manager",
      status: "pending", money: 2200000 }],
  } }));
  let writes = 0;
  await page.route("**/api/market/leagues/l1/direct-listing/offers/direct-offer/accept", async (route) => {
    writes += 1;
    expect(route.request().postDataJSON()).toEqual({ offerMoney: 2200000 });
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/market");
  await page.getByRole("combobox", { name: "Search market" }).fill("No match");
  await expect(page.locator(".market-data-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Market offers, 1 pending", exact: true }).click();
  await page.getByRole("button", { name: "Accept offer for Player 01 from Another Manager", exact: true }).click();
  await page.getByRole("button", { name: "Confirm sale", exact: true }).click();
  await expect(page.getByText("No pending offers.", { exact: true })).toBeVisible();
  expect(writes).toBe(1);
});

test("switching leagues resets the panel and never shows the previous league's offers", async ({ page }) => {
  await mockOffers(page);
  await page.route("**/api/leagues", (route) => route.fulfill({ json: [
    { id: "l1", name: "Demo League", team: { id: "t1", money: 50000000 } },
    { id: "l2", name: "Other League", team: { id: "t2", money: 50000000 } },
  ] }));
  await page.route("**/api/market/leagues/l2", (route) => route.fulfill({ json: { marketPlayers: [], userBids: [] } }));
  await page.route("**/api/market/leagues/l2/player-teams/*/offers", (route) => route.fulfill({ json: { offers: [] } }));
  await page.goto("/market");
  await page.getByRole("button", { name: "Market offers, 2 pending", exact: true }).click();
  await page.getByRole("button", { name: "Accept offer for Player 13 from LaLiga", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("combobox", { name: "League", exact: true }).click();
  await page.getByRole("option", { name: "Other League", exact: true }).click();
  await page.getByRole("button", { name: "Market offers", exact: true }).click();
  await expect(page.getByText("No pending offers.", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Confirm acceptance" })).toHaveCount(0);
});

test("an expired confirmation can be cancelled without locking the remaining offers", async ({ page }) => {
  const fixture = await mockOffers(page);
  await page.goto("/market");
  await page.getByRole("button", { name: "Market offers, 2 pending", exact: true }).click();
  await page.getByRole("button", { name: "Accept offer for Player 13 from LaLiga", exact: true }).click();
  fixture.remove("league-offer");
  await page.getByRole("button", { name: "Refresh offers", exact: true }).click();
  await expect(page.getByText("This offer is no longer available.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel confirmation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Accept offer for Player 13 from Another Manager", exact: true })).toBeEnabled();
});
