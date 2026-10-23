import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { catalog, detail, mockApplication, mockMarketBids } from "./fixtures";

// Opt in explicitly: normal browser checks must not overwrite documentation assets.
test.skip(process.env.UPDATE_DOC_SCREENSHOTS !== "1", "Run bun run screenshots:docs to refresh the gallery");
test.use({ timezoneId: "Europe/Madrid", locale: "en-GB" });
const directory = resolve(process.cwd(), "../docs/images/screenshots");
const crests = JSON.parse(readFileSync(resolve(process.cwd(), "e2e/fixtures/club-crests.json"), "utf8"));

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.locator("img").evaluateAll((images) => Promise.all(images.map((img) => {
    if (img.complete) return;
    return new Promise<void>((done) => { img.onload = () => done(); img.onerror = () => done(); });
  })));
  await page.mouse.move(0, 0);
}
async function capture(page: Page, name: string, target?: Locator, fullPage = false) {
  await ready(page);
  const path = resolve(directory, name);
  if (target) await target.screenshot({ path });
  else await page.screenshot({ path, fullPage });
}
async function badges(page: Page) {
  await page.route("https://assets-fantasy.llt-services.com/teambadge/**", (route) => {
    const encoded = crests[route.request().url()];
    return encoded ? route.fulfill({ contentType: "image/png", body: Buffer.from(encoded, "base64") }) : route.abort();
  });
}
async function theme(page: Page, value = "light") {
  await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), value);
  await page.setViewportSize({ width: 1440, height: 1000 });
}

test("documentation: lineup and fixtures", async ({ page }) => {
  await mockApplication(page);
  await badges(page);
  await theme(page);
  const clubs = [4, 15, 3, 2, 5, 17, 16, 20, 18, 28, 6, 13, 9, 33, 8, 14, 21, 7, 11, 19];
  const matches = Array.from({ length: 10 }, (_, index) => ({ id: `8-${index}`,
    localId: clubs[index * 2], visitorId: clubs[index * 2 + 1],
    matchDate: "2026-10-13T18:00:00Z", matchState: 1, localScore: null, visitorScore: null }));
  await page.route("**/api/calendar/weeks/8", (route) => route.fulfill({ json: matches }));
  await page.route("**/api/calendar/weeks/8/weather", (route) => route.fulfill({ json: {
    weekNumber: 8, generatedAt: "2026-10-12T12:00:00Z", matches: matches.map((m) => ({
      fixtureId: m.id, localId: m.localId, visitorId: m.visitorId, kickoff: m.matchDate,
      fetchedAt: "2026-10-12T11:30:00Z", weather: { snapshot: { temperatureC: 18,
        conditionCode: 801, condition: "few clouds", windSpeedMs: 3,
        precipitationProbability: 0.2, forecastFor: m.matchDate, source: "openweather" } },
    })),
  } }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Lineup builder", exact: true })).toBeVisible();
  await expect(page.getByText("Forecast 18°C · Few clouds").first()).toBeVisible();
  await capture(page, "lineup-current-light.jpg");
  await capture(page, "lineup-current-squad.jpg", undefined, true);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await capture(page, "lineup-current-dark.jpg");
  const fixtures = page.locator(".fixture-matches-panel");
  await fixtures.locator("summary").first().click();
  await expect(fixtures.getByText(/Rain 20%/).first()).toBeVisible();
  await capture(page, "lineup-current-forecast.jpg", fixtures);
  await page.getByRole("button", { name: "Player 01", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "Player 01", exact: true })).toBeVisible();
  await capture(page, "lineup-player-actions.png", page.getByRole("dialog", { name: "Player 01", exact: true }));
});

test("documentation: builder setup and recommendations", async ({ page }) => {
  await mockApplication(page);
  await badges(page);
  await theme(page);
  const base = JSON.parse(readFileSync(resolve(process.cwd(), "../contracts/lineup-builder-response.json"), "utf8")).payload;
  const candidate = structuredClone(base.candidates[0]);
  candidate.formation = "4,3,3";
  candidate.starters = candidate.starters.map((p: Record<string, unknown>, index: number) => ({ ...p,
    player_id: catalog[index].id, player_team_id: `s${catalog[index].id}`,
    name: catalog[index].nickname, position: catalog[index].positionId,
  }));
  candidate.trading_plan.retained_player_ids = catalog.slice(0, 13).map((p) => p.id);
  candidate.trading_plan.resulting_player_ids = [...candidate.trading_plan.retained_player_ids];
  candidate.trading_plan.projected_cash = 50000000;
  candidate.trading_plan.squad_value = 80000000;
  candidate.trading_plan.squad_count = 13;
  candidate.trading_plan.steps = [{ action: "sell", player_id: "14", method: "accepted_offer",
    estimate: 3300000, settlement_at: base.target.sales_deadline, cash_after: 50000000,
    squad_value_after: 80000000, squad_count_after: 13, debt_limit: 16000000, conditions: [] }];
  const result = { ...base, team_id: "t1", league_id: "l1", candidates: [candidate] };
  await page.route("**/api/lineup-builder/leagues/l1/build/stream", (route) => route.fulfill({
    contentType: "application/x-ndjson", body: JSON.stringify({ type: "result", result }) + "\n",
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "Lineup builder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Build lineup", exact: true });
  await capture(page, "lineup-builder-top.png", dialog);
  await dialog.getByText("Choose mandatory players", { exact: false }).click();
  await dialog.getByRole("textbox", { name: "Search available players" }).fill("Player 01");
  await dialog.getByRole("button", { name: /Player 01 My squad/ }).click();
  await dialog.getByLabel("4-3-3", { exact: true }).check();
  await page.setViewportSize({ width: 1440, height: 1600 });
  await capture(page, "lineup-builder-options.png", dialog);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole("button", { name: "Build", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Lineup recommendations" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 2400 });
  await capture(page, "lineup-builder-results.png", dialog.getByRole("region", { name: "Lineup recommendations" }));
  await capture(page, "lineup-builder-pitch.png", dialog.getByLabel("Starting XI preview"));
  await dialog.getByText("Required trades and whole-squad projection", { exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1600 });
  await capture(page, "lineup-builder-projection.png", dialog.locator(".lineup-builder-trades"));
});

test("documentation: market and catalog", async ({ page }) => {
  await mockMarketBids(page);
  await badges(page);
  await theme(page, "dark");
  await page.route("**/api/market/leagues/l1/player-teams/s13/offers", (route) => route.fulfill({ json: { offers: [
    { id: "league-offer", isFromMarket: true, money: 3200000, status: "pending", expirationDate: "2026-10-14T12:00:00Z" },
    { id: "opponent-offer", bidderName: "Another Manager", bidderId: "manager-2", money: 3400000, status: "pending" },
  ] } }));
  await page.goto("/market");
  await expect(page.locator(".market-data-row")).toHaveCount(7);
  await capture(page, "market-board.png");
  await page.getByRole("button", { name: /My bids, 3 active/ }).click();
  await capture(page, "market-bids.png", page.getByRole("dialog", { name: "My bids", exact: true }));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Market offers, 2 pending", exact: true }).click();
  await capture(page, "market-offers.png", page.getByRole("dialog", { name: "Market offers", exact: true }));
  await page.keyboard.press("Escape");
  const row = page.locator(".market-data-row").filter({ has: page.getByRole("link", { name: "Player 16", exact: true }) });
  await row.getByRole("button", { name: "Options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Hire", exact: true }).click();
  await capture(page, "market-hire-dialog.png", page.getByRole("dialog"));
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "market-mobile-dark.png");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/players");
  await expect(page.getByRole("link", { name: "Player 01", exact: true })).toBeVisible();
  await capture(page, "players-catalog.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "players-mobile-dark.png");
});

test("documentation: player profile", async ({ page }) => {
  await mockApplication(page);
  await badges(page);
  await theme(page);
  const profile = structuredClone(detail);
  profile.fixtures.fixtures = [6, 4, 14, 11, 11].map((points, index) => ({
    ...structuredClone(detail.fixtures.fixtures[0]),
    fixture: { ...detail.fixtures.fixtures[0].fixture, matchweek: index + 3,
      date: `2026-10-${String(index + 1).padStart(2, "0")}T16:00:00Z`,
      homeTeam: index % 2 ? "FC Barcelona" : "Real Madrid", awayTeam: index % 2 ? "Villarreal CF" : "FC Barcelona" },
    fantasyPointsTotal: points,
  })).reverse();
  await page.route("**/api/players/1/stats/detail?*", (route) => route.fulfill({ json: profile }));
  await page.goto("/players/1");
  await expect(page.getByRole("heading", { name: "Fantasy outlook", exact: true })).toBeVisible();
  await capture(page, "player-profile-overview.png");
  await capture(page, "player-fixture-stats.png", page.locator(".player-form-section"));
  await capture(page, "player-fantasy-data.png", page.locator(".player-fantasy-section"));
  await capture(page, "player-matches.png", page.locator(".player-match-section"));
  await capture(page, "player-market-value.png", page.locator(".player-market-value-section"));
  await page.getByRole("button", { name: "More averages", exact: true }).click();
  await capture(page, "player-averages-details.png", page.getByRole("dialog", { name: "Per-match performance", exact: true }));
});

// A review sheet makes stale, blank, or clipped captures easier to spot together.
test("documentation: review sheet", async ({ page }, info) => {
  const images = readdirSync(directory).filter((name) => /\.(png|jpg)$/.test(name)).sort();
  expect(images).toHaveLength(23);
  await page.setViewportSize({ width: 1200, height: 1700 });
  await page.setContent(`<style>
    body{margin:0;background:#ddd;font:12px Arial;display:grid;grid-template-columns:repeat(4,1fr)}
    figure{margin:0;padding:8px;height:266px;display:flex;flex-direction:column;align-items:center;gap:8px}
    img{width:100%;height:238px;object-fit:contain}figcaption{text-align:center}
  </style>${images.map((name) => `<figure><img src="data:image/${name.endsWith("jpg") ? "jpeg" : "png"};base64,${readFileSync(resolve(directory, name)).toString("base64")}"><figcaption>${name}</figcaption></figure>`).join("")}`);
  await ready(page);
  await page.screenshot({ path: info.outputPath("docs-contact-sheet.png"), fullPage: true });
});
