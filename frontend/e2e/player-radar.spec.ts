import { expect, test } from "@playwright/test";
import examples from "../test/fixtures/player-radars.json" with { type: "json" };
import { catalog, detail, mockApplication } from "./fixtures";

const response = (radars: unknown[], extra = {}) => ({
  player_id: "1", season: "2026-27", available_seasons: ["2026-27", "2025-26"],
  status: radars.length ? "available" : "unavailable", reason: radars.length ? null : "No radar dataset is available for this selection.",
  radars, compatible_players: [], comparison: null, comparison_reason: null, ...extra,
});

for (const theme of ["light", "dark"]) {
  for (const width of [375, 1440]) {
    test(`supplied role radars are readable at ${width}px in ${theme}`, async ({ page }, info) => {
      await mockApplication(page);
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
      let sample = examples[0];
      await page.route("**/api/players/1/stats/radar?*", (route) => route.fulfill({ json: response([{ ...sample, player_id: "1" }]) }));
      for (sample of examples) {
        await page.goto("/players/1");
        await expect(page.locator(".player-profile-header")).toBeVisible();
        await page.getByRole("heading", { name: "Performance profile", exact: true }).scrollIntoViewIfNeeded();
        const table = page.getByRole("table", { name: `Percentiles for ${sample.player}` });
        await expect(table).toBeVisible();
        await expect(table.getByRole("row")).toHaveCount(8);
        await expect(page.locator(".recharts-radar-polygon")).toHaveCount(1);
        await expect(page.getByText("Reference population unverified", { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.getByText("Source and methodology", { exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText("User-supplied import", { exact: true })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`radar-${theme}-${width}.png`), fullPage: true });
    });
  }
}

test("radar loads independently, missing metrics hide its polygon, and failures preserve the profile", async ({ page }) => {
  await mockApplication(page);
  const sample = structuredClone(examples[0]);
  let calls = 0;
  let fail = false;
  await page.route("**/api/players/1/stats/radar?*", (route) => {
    calls++;
    const url = new URL(route.request().url());
    if (fail) return route.fulfill({ status: 502, json: { error: "radar_source_invalid", detail: "Radar unavailable" } });
    if (url.searchParams.get("season") === "2025-26") return route.fulfill({ json: { ...response([]), season: "2025-26" } });
    return route.fulfill({ json: response([sample]) });
  });
  await page.goto("/players/1");
  await expect(page.locator(".player-profile-header")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Performance profile", exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name: "Load performance radar" })).toHaveCount(0);
  await page.getByRole("heading", { name: "Performance profile", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("table", { name: "Percentiles for Pau Cubarsí" })).toBeVisible();
  expect(calls).toBeGreaterThan(0);
  fail = true;
  await page.getByRole("button", { name: "Refresh performance data" }).click();
  await expect(page.getByRole("alert")).toContainText("Performance data could not be loaded");
  await expect(page.getByRole("table", { name: "Percentiles for Pau Cubarsí" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Form — fixture stats" })).toBeAttached();
  await expect(page.getByLabel("Radar season")).toHaveCount(0);
});

test("a missing spoke is never drawn as zero", async ({ page }) => {
  await mockApplication(page);
  const sample = structuredClone(examples[0]);
  Object.assign(sample.axes[0], { percentile: null, status: "not_published" });
  await page.route("**/api/players/1/stats/radar?*", (route) => route.fulfill({ json: response([sample]) }));
  await page.goto("/players/1");
  await expect(page.locator(".player-profile-header")).toBeVisible();
  await page.getByRole("heading", { name: "Performance profile", exact: true }).scrollIntoViewIfNeeded();
  const table = page.getByRole("table", { name: "Percentiles for Pau Cubarsí" });
  await expect(table.getByRole("row")).toHaveCount(8);
  await expect(table.getByRole("cell", { name: "Not published" })).toBeVisible();
  await expect(page.locator(".player-radar .recharts-radar-polygon")).toHaveCount(0);
});

const coverage = (reason = "ready") => ({
  player_id: "1", season: "2026-27", identity_status: "matched",
  data_status: reason === "ready" ? "ready" : "not_published", reason_code: reason,
  default_profile: "defense_progression_v1", available_profiles: reason === "ready" ? ["defense_progression_v1"] : [],
  profile_errors: {}, last_success_at: "2026-10-12T12:00:00Z", last_attempt_at: "2026-10-12T12:00:00Z",
  last_error_code: null, stale: false, dataset_id: "test-release", catalog_snapshot_id: "test-catalog",
});
const comparable = () => ({ ...structuredClone(examples[0]), cohort: {
  id: "synthetic", label: "Synthetic browser-test population", reference_snapshot: "test-v1",
  eligibility: "300 minutes", size: 100, minimum_minutes: 300,
}, comparison_key: "test-context", comparison_reason: null, warnings: [],
  fetched_at: "2026-10-12T12:00:00Z", data_as_of: "2026-10-11T12:00:00Z" });

for (const { theme, width } of [{ theme: "light", width: 375 }, { theme: "dark", width: 1440 }]) {
  test(`published player comparison supports search, keyboard and refresh: ${theme} ${width}`, async ({ page }, info) => {
    await mockApplication(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    const primary = comparable();
    const other = { ...comparable(), player_id: "2", player: "Compatible Player" };
    let failComparison = false;
    await page.route("**/api/players/1/stats/radar?*", (route) => {
      const params = new URL(route.request().url()).searchParams;
      const season = params.get("season");
      if (season !== "2026-27") return route.fulfill({ json: { ...response([]), season } });
      const compare = params.has("compare_player_id");
      if (compare && failComparison) return route.fulfill({ status: 502, json: { error: "radar_dataset_invalid" } });
      return route.fulfill({ json: response([primary], {
        coverage: coverage(), default_profile: primary.profile,
        compatible_players: [{ player_id: "2", player: "Compatible Player", club: "Other Club", profile: primary.profile }],
        comparison: compare ? other : null,
      }) });
    });
    await page.goto("/players/1");
    await expect(page.locator(".player-profile-header")).toBeVisible();
    const navigation = page.getByRole("navigation", { name: "Player sections" });
    const overview = navigation.getByRole("link", { name: "Overview", exact: true });
    await expect(navigation.getByRole("link", { name: "Performance", exact: true })).toHaveCount(0);
    await overview.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Player 01", exact: true })).toBeFocused();
    const radar = page.locator(".player-profile-header").getByRole("region", { name: "Performance profile", exact: true });
    await expect(radar).toHaveCount(1);
    await radar.scrollIntoViewIfNeeded();
    await expect(overview).toHaveAttribute("aria-current", "location");
    await expect(page.getByRole("table", { name: "Percentiles for Pau Cubarsí", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Preview the six supplied examples" })).toHaveCount(0);
    await page.getByText("Source and methodology", { exact: true }).click();
    await expect(page.locator(".player-radar-methodology time").last()).toHaveAttribute("datetime", "2026-10-11T12:00:00Z");
    const summary = page.getByText("Compare with a compatible player", { exact: true });
    await summary.focus(); await page.keyboard.press("Enter");
    const search = page.getByLabel("Find compatible player");
    await search.fill("missing");
    await expect(page.getByText(/No compatible players match this search/)).toBeVisible();
    await search.fill("Other Club");
    await search.focus(); await page.keyboard.press("Tab");
    const option = page.getByRole("button", { name: "Compatible Player · Other Club · Centre-back" });
    await expect(option).toBeFocused();
    await page.keyboard.press("Enter");
    const table = page.getByRole("table", { name: "Percentiles for Pau Cubarsí and Compatible Player" });
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader")).toHaveCount(3);
    await expect(page.locator(".player-radar .recharts-radar-polygon")).toHaveCount(2);
    failComparison = true;
    await page.getByRole("button", { name: "Refresh performance data", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Comparison could not be updated");
    await expect(search).toHaveValue("Other Club");
    await expect(option).toHaveAttribute("aria-pressed", "true");
    await expect(table).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("heading", { name: "Performance profile", exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole("region", { name: "Performance profile", exact: true }).screenshot({ path: info.outputPath(`published-radar-${theme}-${width}.png`) });
    await expect(page.getByLabel("Radar season")).toHaveCount(0);
  });
}

test("approved default role is selected and season stays pinned despite older available seasons", async ({ page }) => {
  await mockApplication(page);
  const first = structuredClone(examples[0]);
  const second = { ...structuredClone(examples[1]), player_id: "1", player: first.player };
  const requestedSeasons: (string | null)[] = [];
  await page.route("**/api/players/1/stats/radar?*", (route) => {
    requestedSeasons.push(new URL(route.request().url()).searchParams.get("season"));
    return route.fulfill({ json: response([first, second], { coverage: { ...coverage(), default_profile: second.profile, available_profiles: [first.profile, second.profile] }, default_profile: second.profile }) });
  });
  await page.goto("/players/1");
  await expect(page.locator(".player-profile-header")).toBeVisible();
  await page.getByRole("heading", { name: "Performance profile", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByLabel("Radar profile")).toHaveValue(second.profile);
  await page.getByLabel("Radar profile").selectOption(first.profile);
  await expect(page.getByLabel("Radar profile")).toHaveValue(first.profile);
  await expect(page.getByLabel("Radar season")).toHaveCount(0);
  expect(requestedSeasons.length).toBeGreaterThan(0);
  expect(requestedSeasons.every((season) => season === "2026-27")).toBe(true);
});

test("radar is usable while other player details fail", async ({ page }) => {
  await mockApplication(page);
  await page.route("**/api/players/1/stats/detail?*", (route) => route.fulfill({ status: 503, json: { error: "unavailable" } }));
  await page.route("**/api/players/1/stats/radar?*", (route) => route.fulfill({ json: response([comparable()]) }));
  await page.goto("/players/1");
  await page.getByRole("heading", { name: "Performance profile", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("table", { name: "Percentiles for Pau Cubarsí" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry player data" })).toBeVisible();
});

test("coaches have no footballer radar or section link", async ({ page }) => {
  await mockApplication(page);
  await page.route("**/api/players", (route) => route.fulfill({ json: catalog.map((p) => p.id === "1" ? { ...p, positionId: 5 } : p) }));
  await page.route("**/api/players/1/stats/detail?*", (route) => route.fulfill({ json: { ...detail, player: { ...detail.player, positionId: 5 } } }));
  await page.goto("/players/1");
  await expect(page.locator(".player-profile-header")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Form — fixture stats" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Performance profile", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Player sections" }).getByRole("link", { name: "Performance", exact: true })).toHaveCount(0);
});

for (const theme of ["light", "dark"]) {
  test(`published radar reflows at 320 CSS pixels with enlarged text: ${theme}`, async ({ page }, info) => {
    await mockApplication(page);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    await page.route("**/api/players/1/stats/radar?*", (route) => route.fulfill({ json: response([comparable()]) }));
    await page.goto("/players/1");
    await expect(page.locator(".player-profile-header")).toBeVisible();
    await page.getByRole("heading", { name: "Performance profile", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("table", { name: "Percentiles for Pau Cubarsí" })).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > innerWidth)
        .map((el) => ({ tag: el.tagName, class: el.getAttribute("class"), right: el.getBoundingClientRect().right })).slice(0, 20) }));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: JSON.stringify(overflow.elements) }).toBeLessThanOrEqual(320);
    await page.getByRole("region", { name: "Performance profile", exact: true }).screenshot({ path: info.outputPath(`published-reflow-${theme}.png`) });
  });
}

for (const { theme, width, reason } of [
  { theme: "light", width: 375, reason: "not_published" },
  { theme: "dark", width: 1440, reason: "identity_pending" },
  { theme: "dark", width: 375, reason: "expired" },
  { theme: "light", width: 1440, reason: "out_of_scope" },
]) {
  test(`unavailable radar subsection is absent: ${reason} ${theme} ${width}`, async ({ page }) => {
    await mockApplication(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    await page.route("**/api/players/1/stats/radar?*", (route) => route.fulfill({
      json: response([], { coverage: coverage(reason) }),
    }));
    await page.goto("/players/1");
    await expect(page.locator(".player-profile-header")).toBeVisible();
    await page.evaluate(() => document.querySelector(".player-radar-section")?.scrollIntoView());
    await expect(page.locator(".player-radar-section")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Performance profile", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Radar season")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Form — fixture stats" })).toBeAttached();
  });
}

for (const theme of ["light", "dark"]) {
  for (const width of [375, 1440]) {
    test(`player identity appears once and methodology is grouped: ${theme} ${width}`, async ({ page }, info) => {
      await mockApplication(page);
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
      const sample = { ...structuredClone(examples[0]), player: "Player 01", club: "FC Barcelona",
        source: "datamb", method: "provider_native_percentile", data_as_of: null };
      await page.route("**/api/players/1/stats/radar?*", (route) => route.fulfill({ json: response([sample]) }));
      await page.goto("/players/1");
      await expect(page.locator(".player-profile-header")).toBeVisible();
      await page.getByRole("heading", { name: "Performance profile", exact: true }).scrollIntoViewIfNeeded();
      const radar = page.getByRole("region", { name: "Performance profile", exact: true });
      await expect(radar.getByRole("heading", { name: "Centre-back", exact: true })).toBeVisible();
      await expect(radar.getByRole("heading", { name: "Player 01", exact: true })).toHaveCount(0);
      await expect(radar.getByText("FC Barcelona", { exact: true })).toHaveCount(0);
      await expect(radar.locator(".player-radar-legend")).toHaveCount(0);
      await expect(radar.locator("caption")).toHaveClass("visually-hidden");
      const summary = radar.getByText("Source and methodology", { exact: true });
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(radar.getByRole("heading", { name: "Data provenance" })).toBeVisible();
      await expect(radar.getByRole("heading", { name: "Dates", exact: true })).toBeVisible();
      await expect(radar.getByRole("heading", { name: "Reading this radar" })).toBeVisible();
      await expect(radar.getByText("Not provided by the source", { exact: true })).toBeVisible();
      await expect(radar.getByText(/datamb-defense_progression_v1/)).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await summary.evaluate((element) => (element as HTMLElement).blur());
      await radar.locator(".player-radar-methodology").screenshot({ path: info.outputPath(`methodology-${theme}-${width}.png`) });
      await radar.screenshot({ path: info.outputPath(`performance-${theme}-${width}.png`),
        style: ".app-header, .player-detail-sections { visibility: hidden; }" });
    });
  }
}
