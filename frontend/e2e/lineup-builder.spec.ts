import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { catalog, mockApplication } from "./fixtures";

const base = JSON.parse(readFileSync(resolve(process.cwd(), "../contracts/lineup-builder-response.json"), "utf8")).payload;
function response() {
  const candidate = structuredClone(base.candidates[0]);
  candidate.formation = "4,3,3";
  candidate.starters = candidate.starters.map((p: Record<string, unknown>, index: number) => ({ ...p,
    player_id: catalog[index].id, player_team_id: `s${catalog[index].id}`,
    name: catalog[index].nickname, position: catalog[index].positionId,
  }));
  return { ...base, team_id: "t1", league_id: "l1", target: { ...base.target, week: 9 }, candidates: [candidate] };
}

test("builder generates read-only previews and supports keyboard dismissal", async ({ page }, info) => {
  await mockApplication(page);
  await page.route("**/api/players", (route) => route.fulfill({ json: catalog.map((player) => ({
    ...player, photoUrl: "http://127.0.0.1:3100/fixture-player-photo.svg",
  })) }));
  await page.route("**/fixture-player-photo.svg", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><circle cx="48" cy="30" r="18" fill="#35353d"/><path d="M12 96V78a36 36 0 0 1 72 0v18" fill="#ff4b44"/></svg>',
  }));
  const requests: string[] = [];
  await page.route("**/api/lineup-builder/leagues/l1/build", async (route) => {
    requests.push(route.request().method());
    expect(route.request().postDataJSON().mandatory_player_ids).toEqual([]);
    const value = response();
    Object.assign(value.candidates[0].starters[0], {
      lineup_score: "0", trading_score: "0.3", combined_score: "0.3",
      omissions: ["fantasy_average", "weather"],
      sections: [{ section: "market", lineup_raw: "0", trading_raw: "3",
        lineup_lower: "0", lineup_upper: "0", trading_lower: "-10", trading_upper: "10",
        lineup_normalized: "0", trading_normalized: "0.3", effective_weight: "0",
        criteria: [{ rule_id: "market_growth_and_value", observed: "0.03579099345999330549621278496",
          source: "fantasy_market_history", lineup: null, trading: "3",
          lineup_lower: "0", lineup_upper: "0", trading_lower: "-10", trading_upper: "10" }],
      }],
    });
    value.candidates[0].trading_plan.retained_player_ids = catalog.slice(0, 13).map((player) => player.id);
    value.diagnostics = [{ player_id: catalog[12].id, code: "player_unavailable" }];
    value.candidates[0].trading_plan.steps = [{
      action: "sell", player_id: catalog[13].id, method: "accepted_offer", estimate: 3300000,
      settlement_at: value.target.sales_deadline, cash_after: 50000000, squad_value_after: 80000000,
      squad_count_after: 13, debt_limit: 16000000, conditions: ["Offer must settle before kickoff"],
    }];
    await route.fulfill({ json: value });
  });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /build|recommend/i }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Build lineup" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Build", exact: true })).toHaveCSS("background-color", "rgb(255, 75, 68)");
  await dialog.getByRole("button", { name: "Build", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Lineup recommendations" })).toBeVisible();
  await expect(dialog.getByText("Owned starting XI", { exact: false })).toBeVisible();
  const preview = dialog.getByLabel("Starting XI preview");
  await preview.scrollIntoViewIfNeeded();
  await expect(preview.locator("img")).toHaveCount(11);
  await expect(preview.locator("img").first()).toBeVisible();
  await expect(preview.locator("img").first()).toHaveJSProperty("naturalWidth", 96);
  await preview.screenshot({ path: info.outputPath("lineup-builder-player-photos.png") });
  const exclusions = dialog.getByRole("table", { name: "Source exclusions" });
  await expect(exclusions).not.toBeVisible();
  await dialog.getByText("1 source exclusions", { exact: true }).locator("..").focus();
  await page.keyboard.press("Enter");
  await expect(exclusions).toBeVisible();
  await expect(exclusions.getByRole("rowheader", { name: "Player 13" })).toBeVisible();
  await expect(exclusions.getByRole("cell", { name: "The player is unavailable for the target round." })).toBeVisible();
  await exclusions.screenshot({ path: info.outputPath("lineup-builder-exclusions.png") });
  await page.keyboard.press("Enter");
  await expect(exclusions).not.toBeVisible();
  await dialog.getByText("Required trades and whole-squad projection", { exact: true }).click();
  await expect(dialog.getByRole("list", { name: "Players retained" })).toContainText("Player 13");
  await expect(dialog.getByRole("heading", { name: "Sell Player 14" })).toBeVisible();
  await dialog.locator(".lineup-builder-trades").screenshot({ path: info.outputPath("lineup-builder-trades.png") });
  await dialog.locator(".lineup-builder-transactions").scrollIntoViewIfNeeded();
  await dialog.locator(".lineup-builder-transactions").screenshot({ path: info.outputPath("lineup-builder-transactions.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.locator(".lineup-builder-trades").scrollIntoViewIfNeeded();
  await dialog.locator(".lineup-builder-trades").screenshot({ path: info.outputPath("lineup-builder-trades-mobile.png") });
  await dialog.locator(".lineup-builder-transactions").scrollIntoViewIfNeeded();
  await dialog.locator(".lineup-builder-transactions").screenshot({ path: info.outputPath("lineup-builder-transactions-mobile.png") });
  await page.setViewportSize({ width: 1280, height: 720 });
  await dialog.getByText("Player scores and selection reasons", { exact: true }).click();
  const reasoning = dialog.locator(".lineup-builder-player-reasoning").first();
  await reasoning.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(reasoning).toHaveAttribute("open", "");
  await expect(reasoning.getByText(/\+3.58% over five days/)).toBeVisible();
  await expect(reasoning.getByText("Match-day weather is unavailable")).toBeVisible();
  await reasoning.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("lineup-builder-readable-scores.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await reasoning.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("lineup-builder-readable-scores-mobile.png") });
  await page.setViewportSize({ width: 1280, height: 720 });
  const buttons = await dialog.getByRole("button").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).borderRadius));
  expect(buttons.every((radius) => radius === "0px")).toBe(true);
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toHaveCSS("background-color", "rgb(237, 237, 239)");
  await dialog.getByRole("button", { name: "Use as draft" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("lineup-builder-results.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(requests).toEqual(["POST"]);
});

test("builder reports a source failure and never saves a lineup", async ({ page }) => {
  await mockApplication(page);
  let saves = 0;
  await page.route("**/api/teams/*/lineup", async (route) => {
    if (route.request().method() === "PUT") saves++;
    await route.fallback();
  });
  await page.route("**/api/lineup-builder/leagues/l1/build", (route) => route.fulfill({ status: 503,
    json: { error: "financial_data_unavailable", detail: "Cash unavailable" } }));
  await page.goto("/");
  await page.getByRole("button", { name: /build|recommend/i }).first().click();
  const dialog = page.getByRole("dialog", { name: "Build lineup" });
  await dialog.getByRole("button", { name: "Build", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Cash");
  expect(saves).toBe(0);
});


test("owned candidate applies only to the matching editable draft without saving", async ({ page }) => {
  await mockApplication(page);
  let saves = 0;
  let targetWeek = 9;
  await page.route("**/api/calendar/current", (route) => route.fulfill({ json: {
    weekNumber: 8, nextWeek: 8, previousWeek: 7, isLive: false,
    openingWeekDate: base.target.first_kickoff,
  } }));
  await page.route("**/api/teams/*/lineup", async (route) => {
    if (route.request().method() === "PUT") saves++;
    await route.fallback();
  });
  await page.route("**/api/lineup-builder/leagues/l1/build", (route) => {
    const value = response();
    value.target.week = targetWeek;
    return route.fulfill({ json: value });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Lineup builder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Build lineup" });
  await dialog.getByRole("button", { name: "Build", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Use as draft" })).toBeDisabled();
  targetWeek = 8;
  await dialog.getByRole("button", { name: "Build", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Use as draft" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Use as draft" }).click();
  await expect(dialog).not.toBeVisible();
  expect(saves).toBe(0);
});

for (const source of ["market", "opponents"] as const) {
  test(`${source} proposals remain visible while draft use is disabled`, async ({ page }) => {
    await mockApplication(page);
    await page.route("**/api/calendar/current", (route) => route.fulfill({ json: {
      weekNumber: 8, nextWeek: 8, previousWeek: 7, isLive: false,
      openingWeekDate: base.target.first_kickoff,
    } }));
    const proposed = response();
    proposed.target.week = 8;
    const external = structuredClone(proposed.candidates[0]);
    external.candidate_id = "external-proposal";
    external.resource_group = "external";
    Object.assign(external.starters[1], { player_id: catalog[13].id,
      name: catalog[13].nickname, source, player_team_id: source === "opponents" ? "opponent-slot" : null,
    });
    proposed.candidates.push(external);
    let writes = 0;
    await page.route("**/api/teams/*/lineup", async (route) => {
      if (route.request().method() === "PUT") writes++;
      await route.fallback();
    });
    await page.route("**/api/lineup-builder/leagues/l1/build", (route) => {
      expect(route.request().postDataJSON()).toMatchObject({
        sources: ["owned", source], allow_buying: true,
      });
      return route.fulfill({ json: proposed });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Lineup builder", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Build lineup" });
    await dialog.getByRole("checkbox", { name: source === "market"
      ? "Consider players on the market" : "Consider opponent players" }).check();
    await expect(dialog.getByText("Enable purchase recommendations to include market or opponent players in proposed lineups.")).toBeVisible();
    await dialog.getByRole("checkbox", { name: "Allow purchase recommendations" }).check();
    await dialog.getByRole("button", { name: "Build", exact: true }).click();
    const candidates = dialog.locator(".lineup-builder-candidate");
    await expect(candidates).toHaveCount(2);
    await expect(candidates.first().getByRole("button", { name: "Use as draft" })).toBeEnabled();
    await expect(candidates.last().getByText(/Acquisitions required/)).toBeVisible();
    await expect(candidates.last().getByRole("button", { name: "Use as draft" })).toBeDisabled();
    const externalCard = candidates.last().locator(".lineup-builder-preview-player.is-not-owned");
    await expect(externalCard).toHaveCount(1);
    await expect(externalCard).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(externalCard.locator(".fb-avatar")).toHaveCSS("background-color", "rgb(255, 75, 68)");
    await externalCard.hover();
    await expect(page.getByRole("tooltip")).toContainText("This player is not in your squad.");
    await page.mouse.move(0, 0);
    await expect(page.getByRole("tooltip")).not.toBeVisible();
    await page.keyboard.press("Tab");
    await externalCard.focus();
    await expect(page.getByRole("tooltip")).toContainText("This player is not in your squad.");
    await expect(candidates.last().getByText(/Proposal only: acquire these players first/)).toBeVisible();
    expect(writes).toBe(0);
  });
}

for (const action of ["bid", "offer", "clause"] as const) {
  test(`preview ${action} uses current identifiers and waits for explicit confirmation`, async ({ page }, info) => {
    await mockApplication(page);
    const source = action === "bid" ? "market" : "opponents";
    const proposed = response();
    const external = structuredClone(proposed.candidates[0]);
    external.candidate_id = "external-proposal";
    external.resource_group = "external";
    Object.assign(external.starters[1], { player_id: "14", name: "Player 14", source,
      player_team_id: source === "opponents" ? "opponent-entry-14" : null });
    proposed.candidates.push(external);
    await page.route("**/api/leagues", (route) => route.fulfill({ json: [{
      id: "l1", name: "Demo League", team: { id: "t1", money: 50000000, teamValue: 80000000 },
      config: { features: { buyoutClause: true } },
    }] }));
    await page.route("**/api/leagues/l1/teams/t2", (route) => route.fulfill({ json: {
      id: "t2", players: [{ playerTeamId: "opponent-entry-14", playerMaster: catalog[13],
        buyoutClause: 7000000, buyoutClauseLockedEndTime: "2026-10-01T12:00:00Z", isShielded: false }],
    } }));
    await page.route("**/api/lineup-builder/leagues/l1/build", (route) => route.fulfill({ json: proposed }));
    const writes: { path: string; body: unknown }[] = [];
    await page.route("**/api/market/leagues/l1/**", async (route) => {
      if (route.request().method() === "GET") return route.fallback();
      writes.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      await route.fulfill({ json: { ok: true, id: "confirmed" } });
    });
    await page.route("**/api/buyout/leagues/l1/**", async (route) => {
      writes.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Lineup builder", exact: true }).click();
    const builder = page.getByRole("dialog", { name: "Build lineup" });
    await builder.getByRole("checkbox", { name: source === "market" ? "Consider players on the market" : "Consider opponent players" }).check();
    await builder.getByRole("checkbox", { name: "Allow purchase recommendations" }).check();
    await builder.getByRole("button", { name: "Build", exact: true }).click();
    const card = builder.locator(".lineup-builder-preview-player.is-not-owned");
    await card.getByRole("button", { name: "Acquire Player 14" }).click();
    const options = page.getByRole("dialog", { name: "Player 14 — Acquisition options" });
    const label = action === "bid" ? "Place bid" : action === "offer" ? "Make offer" : "Pay release clause";
    await expect(options.getByRole("button", { name: label, exact: true })).toBeEnabled();
    await options.getByRole("button", { name: label, exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: action === "bid" ? "Hire player" : label, exact: true });
    await expect(confirmation).toBeVisible();
    expect(writes).toEqual([]);
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(options).toBeVisible();
    expect(writes).toEqual([]);
    await options.getByRole("button", { name: label, exact: true }).click();
    await confirmation.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(options).toBeVisible();
    expect(writes).toEqual([{ path: action === "bid" ? "/api/market/leagues/l1/m14/bids"
      : action === "offer" ? "/api/market/leagues/l1/direct-offers"
        : "/api/buyout/leagues/l1/player-teams/opponent-entry-14/pay",
      body: action === "clause" ? { buyoutClauseToPay: 7000000 }
        : action === "offer" ? { playerId: "opponent-entry-14", money: 3300000 } : { money: 3300000 },
    }]);
    await options.getByRole("button", { name: "Close", exact: true }).click();
    await expect(builder.getByText("Your acquisition activity changed. Rebuild the recommendations before using a draft.")).toBeVisible();
    await expect(builder.locator(".lineup-builder-candidate").first().getByRole("button", { name: "Use as draft" })).toBeDisabled();
    if (action === "bid") {
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath("lineup-builder-acquisition-card.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByRole("button", { name: "Acquire Player 14" })).toBeVisible();
      await page.screenshot({ path: info.outputPath("lineup-builder-acquisition-card-mobile.png") });
    }
  });
}

test("preview keeps release-clause payment disabled when shield status is unknown", async ({ page }) => {
  await mockApplication(page);
  await page.route("**/api/leagues", (route) => route.fulfill({ json: [{
    id: "l1", name: "Demo League", team: { id: "t1", money: 50000000, teamValue: 80000000 },
    config: { features: { buyoutClause: true } },
  }] }));
  await page.route("**/api/leagues/l1/teams/t2", (route) => route.fulfill({ json: {
    id: "t2", players: [{ playerTeamId: "opponent-entry-14", playerMaster: catalog[13],
      buyoutClause: 7000000, buyoutClauseLockedEndTime: "2026-10-01T12:00:00Z" }],
  } }));
  const proposed = response();
  proposed.candidates[0].resource_group = "external";
  Object.assign(proposed.candidates[0].starters[1], { player_id: "14", name: "Player 14",
    source: "opponents", player_team_id: "opponent-entry-14" });
  await page.route("**/api/lineup-builder/leagues/l1/build", (route) => route.fulfill({ json: proposed }));
  await page.goto("/");
  await page.getByRole("button", { name: "Lineup builder", exact: true }).click();
  const builder = page.getByRole("dialog", { name: "Build lineup" });
  await builder.getByRole("checkbox", { name: "Consider opponent players" }).check();
  await builder.getByRole("checkbox", { name: "Allow purchase recommendations" }).check();
  await builder.getByRole("button", { name: "Build", exact: true }).click();
  await builder.getByRole("button", { name: "Acquire Player 14" }).click();
  const options = page.getByRole("dialog", { name: "Player 14 — Acquisition options" });
  await expect(options.getByRole("button", { name: "Make offer" })).toBeEnabled();
  await expect(options.getByRole("button", { name: "Pay release clause" })).toBeDisabled();
  await expect(options.getByText("The player's shield status could not be verified.")).toBeVisible();
});
