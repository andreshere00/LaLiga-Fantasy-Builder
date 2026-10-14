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
  const requests: string[] = [];
  await page.route("**/api/lineup-builder/leagues/l1/build", async (route) => {
    requests.push(route.request().method());
    expect(route.request().postDataJSON().mandatory_player_ids).toEqual([]);
    await route.fulfill({ json: response() });
  });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /build|recommend/i }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Build lineup" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Build", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Lineup recommendations" })).toBeVisible();
  await expect(dialog.getByText("Owned starting XI", { exact: false })).toBeVisible();
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
