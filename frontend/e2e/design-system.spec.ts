import { test, expect } from "@playwright/test";
import { detail, mockApplication } from "./fixtures";

const routes = [
  { path: "/", heading: /Demo Manager.*lineup/i, name: "lineup" },
  { path: "/market", heading: "Market", name: "market" },
  { path: "/players?q=Player", heading: "Players", name: "players" },
  { path: "/players/1", heading: "Player 01", name: "detail" },
];

for (const theme of ["light", "dark"]) {
  for (const width of [375, 800, 1024, 1440]) {
    for (const route of routes) {
      test(route.name + " " + theme + " " + width, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 1000 });
        await mockApplication(page);
        if (route.name === "detail") {
          await page.route("**/api/players/1/stats/detail?*", (request) => request.fulfill({ json: {
            ...detail, profile: { ...detail.profile, injuryRisk: { level: "unknown" } },
          } }));
        }
        await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(route.path);
        await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
        if (route.name === "market") await expect(page.locator(".market-data-row")).toHaveCount(7);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(async () => {
          const faces = await document.fonts.load('14px "LALIGA Text"');
          return faces.length > 0 && faces.every((face) => face.status === "loaded");
        })).toBe(true);
        await expect(page.locator("body")).toHaveCSS("font-family", '"LALIGA Text", Arial, sans-serif');
        if (route.name === "detail") {
          const summary = page.locator(".player-detail-fantasy-summary");
          await expect(summary.locator(".player-fantasy-summary-block")).toHaveCount(4);
          const hierarchy = summary.locator(".player-fantasy-summary-block--hierarchy");
          await hierarchy.hover();
          await expect(page.getByRole("tooltip")).toContainText("player's role on the team");
          await expect(hierarchy.locator("dd")).toHaveCSS("text-align", "left");
          const summaryFontSize = await hierarchy.locator("dd").evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize));
          expect(summaryFontSize).toBeGreaterThanOrEqual(16);
          await expect(hierarchy.locator("dd")).toHaveCSS("justify-content", "center");
          await expect(summary.locator("dt img, dt svg")).toHaveCount(0);
          await expect(hierarchy.locator("dd img")).toBeVisible();
          await expect(summary.locator(`.player-form-rating-icon.is-${theme}`)).toBeVisible();
          await expect(summary.locator(`.player-form-rating-icon.is-${theme === "light" ? "dark" : "light"}`)).toBeHidden();
          const riskIcon = summary.locator(".player-fantasy-risk-icon.is-unknown");
          await expect(riskIcon).toBeVisible();
          await expect(summary.getByText("Unknown", { exact: true })).toBeVisible();
          if (theme === "dark") await expect(riskIcon).toHaveCSS("filter", "brightness(0) invert(1)");
          if (width > 1100) {
            const tops = await page.locator(
              ".player-detail-header-identity, .player-detail-header-actions",
            ).evaluateAll((elements) => elements.map((element) => {
              const rect = element.getBoundingClientRect();
              return rect.top;
            }));
            expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
            await expect(page.locator(".player-detail-header-averages .fb-metric-grid > div")).toHaveCount(6);
          }
          await hierarchy.focus();
          await expect(page.getByRole("tooltip")).toBeVisible();
          await hierarchy.blur();
          await page.locator(".player-detail-back").hover();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(errors).toEqual([]);
        await page.screenshot({ path: info.outputPath(route.name + "-" + theme + "-" + width + ".png"), fullPage: true });
      });
    }
  }
}

test("filters trap keyboard focus, cancel without applying, and restore focus", async ({ page }) => {
  await mockApplication(page);
  await page.goto("/market");
  const trigger = page.getByRole("button", { name: "Filter Player", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.getByLabel("Player name", { exact: true }).fill("No match");
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(page.locator(".market-data-row")).toHaveCount(7);
  await trigger.click();
  await expect(page.getByLabel("Player name", { exact: true })).toHaveValue("");
  await page.getByLabel("Player name", { exact: true }).fill("No match");
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.locator(".market-data-row")).toHaveCount(0);
});

test("custom calendar cancels edits, applies confirmed dates, and follows the dark theme", async ({ page }) => {
  await mockApplication(page);
  await page.goto("/players/1");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  const custom = page.getByRole("button", { name: "Custom", exact: true });
  await custom.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("grid")).toBeVisible();
  await page.getByLabel("From", { exact: true }).fill("2026-10-01");
  await page.getByLabel("To", { exact: true }).fill("2026-10-12");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(custom).toBeFocused();
  await custom.click();
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("");
  await page.getByLabel("From", { exact: true }).fill("2026-10-01");
  await page.getByLabel("To", { exact: true }).fill("2026-10-12");
  const request = page.waitForRequest((req) => req.url().includes("/stats/detail?") && req.url().includes("from=2026-10-01"));
  await page.getByRole("button", { name: "Apply range", exact: true }).click();
  await request;
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const gate of ["signed-out", "unlinked", "needs-reauth", "unavailable"]) {
  test("access gate " + gate, async ({ page }) => {
    await mockApplication(page);
    if (gate === "signed-out") await page.route("**/auth/get-session", (route) => route.fulfill({ status: 200, json: null }));
    else await page.route("**/laliga/connection", (route) => gate === "unavailable"
      ? route.fulfill({ status: 503, json: { error: "unavailable" } })
      : route.fulfill({ json: { linked: gate !== "unlinked", needsReauth: gate === "needs-reauth", managerId: "demo", managerName: null, avatar: null } }));
    await page.goto("/");
    const headings = { "signed-out": "Sign in", unlinked: "Connect LaLiga", "needs-reauth": "Reconnect LaLiga", unavailable: "Connection check failed" };
    await expect(page.getByRole("heading", { name: headings[gate as keyof typeof headings], exact: true })).toBeVisible();
  });
}

for (const width of [700, 701, 800, 801]) {
  test("catalog breakpoint " + width, async ({ page }) => {
    await mockApplication(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/players?q=Player");
    await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
    await expect(page.locator(".players-player-heading")).toBeVisible();
    await expect(page.locator(".market-head-cell-team")).toBeVisible();
    await expect(page.locator(".market-head-cell-fsyp")).toBeVisible();
    await expect(page.locator(".players-row .market-fsyp-cell").first()).toBeVisible();
    const tableOverflows = await page.locator(".players-list").evaluate(
      (list) => list.scrollWidth > list.clientWidth,
    );
    expect(tableOverflows).toBe(width > 700);
  });
}

for (const path of ["/contact", "/unknown-route"]) {
  test("supporting screen " + path, async ({ page }) => {
    await mockApplication(page);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: path === "/contact" ? "Contact" : "Page not found", exact: true })).toBeVisible();
  });
}

test("market bids can cross zero cash up to the inclusive squad debt limit", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-12T12:00:00Z") });
  await mockApplication(page);
  await page.route("**/api/teams/t1/money", (route) => route.fulfill({ json: { teamMoney: 1000000 } }));
  await page.goto("/market");
  await page.getByRole("button", { name: "Options", exact: true }).first().click();
  await expect(page.getByRole("menuitem", { name: "Hire", exact: true })).toBeEnabled();
  await page.getByRole("menuitem", { name: "Hire", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Hire player", exact: true });
  const amount = dialog.getByRole("textbox", { name: "Bid amount", exact: true });
  const confirm = dialog.getByRole("button", { name: "Place bid", exact: true });
  await expect(confirm).toBeEnabled();
  await expect(dialog).toContainText("available cash plus up to 20% of squad value");
  await amount.fill("17000001");
  await expect(confirm).toBeDisabled();
  await amount.fill("17000000");
  await expect(confirm).toBeEnabled();
});

test("bid feedback waits for a confirmed mocked response", async ({ page }) => {
  await mockApplication(page);
  let release: () => void = () => {};
  const response = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/market/leagues/l1/m14/bids", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ money: 3300000 });
    await response;
    await route.fulfill({ json: { id: "fixture-bid" } });
  });
  await page.goto("/market");
  await page.getByRole("button", { name: "Options", exact: true }).first().click();
  await page.getByRole("menuitem", { name: "Hire", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Hire player" })).toBeVisible();
  await page.getByRole("button", { name: "Place bid", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sending…", exact: true })).toBeDisabled();
  const pendingDialog = page.getByRole("dialog", { name: "Hire player" });
  await expect(pendingDialog).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  await expect(pendingDialog).toBeVisible();
  await expect(page.locator(".fb-toast")).toHaveCount(0);
  release();
  await expect(page.locator(".fb-toast").getByText("Bid submitted", { exact: true })).toBeVisible();
});

test("date range errors explain the correction and remain associated with the inputs", async ({ page }) => {
  await mockApplication(page);
  await page.goto("/players/1");
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  const from = page.getByLabel("From", { exact: true });
  const to = page.getByLabel("To", { exact: true });
  await from.fill("2026-10-20");
  await to.fill("2026-10-01");
  const error = page.getByRole("alert");
  await expect(error).toHaveText("Choose an end date on or after the start date.");
  await expect(to).toHaveAttribute("aria-describedby", (await error.getAttribute("id"))!);
  await expect(to).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Apply range", exact: true })).toBeDisabled();
  await to.fill("2026-10-21");
  await expect(error).toHaveCount(0);
  await expect(to).not.toHaveAttribute("aria-invalid");
  await expect(page.getByRole("button", { name: "Apply range", exact: true })).toBeEnabled();
});
