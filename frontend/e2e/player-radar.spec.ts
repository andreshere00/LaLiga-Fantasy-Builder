import { expect, test } from "@playwright/test";
import examples from "../src/features/players/radar/examples.json" with { type: "json" };
import { mockApplication } from "./fixtures";

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
      await page.goto("/players/radar-preview");
      await expect(page.getByRole("heading", { name: "Player performance radars" })).toBeVisible();
      const select = page.getByLabel("Example player");
      for (const sample of examples) {
        await select.selectOption(sample.player_id);
        const table = page.getByRole("table", { name: `Percentiles for ${sample.player}` });
        await expect(table).toBeVisible();
        await expect(table.getByRole("row")).toHaveCount(8);
        await expect(page.locator(".recharts-radar-polygon")).toHaveCount(1);
        await expect(page.getByText("Reference population unverified", { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await select.selectOption("6");
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
  await expect(page.getByRole("heading", { name: "Performance profile", exact: true })).toBeAttached();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Load performance radar" }).click();
  await expect(page.getByRole("table", { name: "Percentiles for Pau Cubarsí" })).toBeVisible();
  await page.getByLabel("Radar season").selectOption("2025-26");
  await expect(page.getByText("No radar dataset is available for this selection.", { exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "Percentiles for Pau Cubarsí" })).toHaveCount(0);
  fail = true;
  await page.getByLabel("Radar season").selectOption("2026-27");
  await page.getByRole("button", { name: "Refresh performance data" }).click();
  await expect(page.getByRole("alert")).toContainText("Performance data could not be loaded");
  await expect(page.getByRole("heading", { name: "Form — fixture stats" })).toBeAttached();
});

test("a missing spoke is never drawn as zero", async ({ page }) => {
  await mockApplication(page);
  const sample = structuredClone(examples[0]);
  Object.assign(sample.axes[0], { percentile: null, status: "not_published" });
  await page.route("**/api/players/1/stats/radar?*", (route) => route.fulfill({ json: response([sample]) }));
  await page.goto("/players/1");
  await page.getByRole("button", { name: "Load performance radar" }).click();
  const table = page.getByRole("table", { name: "Percentiles for Pau Cubarsí" });
  await expect(table.getByRole("row")).toHaveCount(8);
  await expect(table.getByRole("cell", { name: "Not published" })).toBeVisible();
  await expect(page.locator(".player-radar .recharts-radar-polygon")).toHaveCount(0);
});
