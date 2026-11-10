import { expect, test } from "@playwright/test";

import { detail, mockApplication } from "./fixtures";

test("squad filter keeps goalkeepers and can be cleared", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApplication(page);
  await page.goto("/");
  const squad = page.locator(".squad-grid--ready");
  await expect(squad.getByRole("button", { name: /^Player 06/ })).toBeVisible();
  await page.getByRole("button", { name: "Filter squad" }).click();
  const filterDialog = page.getByRole("dialog", { name: "Filter squad" });
  await expect(filterDialog.locator("summary")).toHaveCount(0);
  await expect(filterDialog.getByRole("group", { name: "Club" })).toBeVisible();
  await expect(page.getByRole("slider", { name: /^(Minimum|Maximum) FSYP$/ })).toHaveCount(2);
  await page.screenshot({ path: info.outputPath("squad-filter-desktop-light.png") });
  await page.getByRole("button", { name: "Goalkeeper", exact: true }).click();
  await expect(filterDialog.getByRole("region", { name: "Position" })).toContainText("Goalkeeper");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(squad.getByRole("button", { name: /^Player 06/ })).toBeVisible();

  await page.getByRole("button", { name: "Filter squad" }).click();
  await page.getByRole("button", { name: "Goalkeeper", exact: true }).click();
  await page.getByRole("button", { name: /^Show \d+ players?$/ }).click();
  await expect(page.getByRole("dialog", { name: "Filter squad" })).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Showing" })).toBeVisible();
  await expect(squad.getByRole("button", { name: /^Player 01/ })).toBeVisible();
  await expect(squad.getByRole("button", { name: /^Player 06/ })).toHaveCount(0);
  const applied = page.getByRole("list", { name: "Applied filters" });
  await expect(applied.getByRole("listitem")).toHaveText(["PositionGoalkeeper×"]);

  await applied.getByRole("button", { name: "Remove filter: Position" }).click();
  await expect(applied).toHaveCount(0);
  await expect(squad.getByRole("button", { name: /^Player 06/ })).toBeVisible();
});

test("phone squad filter opens as a dialog", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockApplication(page);
  await page.addInitScript(() => localStorage.setItem("lfb-theme", "dark"));
  await page.goto("/");
  await page.getByRole("button", { name: "Filter squad" }).click();
  const dialog = page.getByRole("dialog", { name: "Filter squad" });
  await expect(dialog.getByRole("group", { name: "Position" })).toBeVisible();
  await expect(dialog.locator("summary")).toHaveCount(6);
  const positions = dialog.getByRole("group", { name: "Position" }).getByRole("button");
  await expect(positions).toHaveText(["GKP", "DEF", "MDF", "ATK", "COA"]);
  await expect(dialog.getByRole("button", { name: "Goalkeeper", exact: true })).toBeVisible();
  const positionTops = await positions.evaluateAll((nodes) =>
    new Set(nodes.map((node) => Math.round(node.getBoundingClientRect().top))).size);
  expect(positionTops).toBe(1);
  await dialog.getByRole("button", { name: "Midfielder", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toHaveText("Midfielder");
  await page.mouse.move(5, 5);
  await dialog.getByRole("button", { name: "Goalkeeper", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tooltip")).toHaveText("Defense");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Club" })).toBeHidden();
  const clubDisclosure = dialog.locator("summary").filter({ hasText: "Club" });
  await clubDisclosure.focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("group", { name: "Club" })).toBeVisible();
  const crest = dialog.locator(".squad-filter-club-crest img").first();
  await expect(crest).toBeVisible();
  await expect(crest).toHaveCSS("object-fit", "contain");
  await expect(clubDisclosure).toBeFocused();
  const formDisclosure = dialog.locator("summary").filter({ hasText: "Form" });
  await formDisclosure.click();
  const poor = dialog.getByRole("group", { name: "Poor" });
  const good = dialog.getByRole("group", { name: "Good" });
  await expect(poor.getByRole("button", { name: "Very poor" })).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Average" })).toBeVisible();
  await expect(good.getByRole("button", { name: "Very good" })).toBeVisible();
  const poorBox = await poor.boundingBox();
  const goodBox = await good.boundingBox();
  expect(poorBox && goodBox && Math.abs(poorBox.x - goodBox.x)).toBeLessThan(2);
  expect(poorBox && goodBox && Math.abs(poorBox.width - goodBox.width)).toBeLessThan(2);
  await dialog.locator("summary").filter({ hasText: "Availability" }).click();
  const availabilityButtons = ["Available", "Questionable", "Unavailable"].map((name) =>
    dialog.getByRole("button", { name, exact: true }));
  const availabilityBoxes = await Promise.all(availabilityButtons.map((button) => button.boundingBox()));
  const [first, second, third] = availabilityBoxes;
  expect(first && second && third).toBeTruthy();
  expect(Math.abs(first!.width - second!.width)).toBeLessThan(2);
  expect(Math.abs(second!.width - third!.width)).toBeLessThan(2);
  expect(Math.abs(first!.x - third!.x)).toBeLessThan(2);
  await availabilityButtons[2].scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("squad-filter-phone-dark.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("start probability slider keeps players at or above the minimum", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApplication(page);
  await page.route("**/api/players/*/stats/profile", (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3];
    return route.fulfill({ json: {
      ...detail.profile, playerId: id,
      startProbability: { matchweek: 9, percent: { "1": 100, "2": 0, "3": 85 }[id] ?? 50 },
    } });
  });
  await page.goto("/");
  const squad = page.locator(".squad-grid--ready");
  await expect(squad.getByRole("button", { name: /^Player 02/ })).toBeVisible();
  await page.getByRole("button", { name: "Filter squad" }).click();
  const dialog = page.getByRole("dialog", { name: "Filter squad" });
  const thumb = dialog.getByRole("slider", { name: "Minimum start probability" });
  await thumb.focus();
  for (const key of ["PageUp", "PageUp", "PageUp", "ArrowRight", "ArrowRight"]) {
    await page.keyboard.press(key);
  }
  await expect(thumb).toHaveValue("85");
  await expect(dialog.getByRole("progressbar")).toHaveCount(0);
  await expect(dialog.getByRole("region", { name: "Start probability" }))
    .toContainText("At least 85%");
  await page.screenshot({ path: info.outputPath("squad-filter-probability.png") });
  await dialog.getByRole("button", { name: "Show 2 players" }).click();
  await expect(squad.getByRole("button", { name: /^Player 01/ })).toBeVisible();
  await expect(squad.getByRole("button", { name: /^Player 03/ })).toBeVisible();
  await expect(squad.getByRole("button", { name: /^Player 02/ })).toHaveCount(0);
});

for (const { device, width, height, columns } of [
  { device: "iPhone 19.5:9", width: 393, height: 852, columns: 0 },
  { device: "iPad 4:3 portrait", width: 768, height: 1024, columns: 2 },
  { device: "iPad 4:3 landscape", width: 1024, height: 768, columns: 3 },
  { device: "Mac 16:10", width: 1440, height: 900, columns: 3 },
  { device: "Mac 16:9", width: 1920, height: 1080, columns: 3 },
]) {
  test(`squad filter layout fits ${device}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await mockApplication(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Filter squad" }).click();
    const dialog = page.getByRole("dialog", { name: "Filter squad" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
    await expect(dialog.getByRole("button", { name: /^Show \d+ players?$/ })).toBeInViewport();
    if (columns === 0) {
      await expect(dialog.locator("summary")).toHaveCount(6);
    } else {
      const sections = dialog.locator(".squad-filter-section");
      await expect(sections).toHaveCount(6);
      const lefts = await sections.evaluateAll((nodes) =>
        [...new Set(nodes.map((node) => Math.round(node.getBoundingClientRect().left)))]);
      expect(lefts).toHaveLength(columns);
    }
    await page.screenshot({ path: info.outputPath(`squad-filter-${width}x${height}.png`) });
  });
}
