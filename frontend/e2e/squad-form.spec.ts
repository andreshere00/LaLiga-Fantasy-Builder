import { test, expect } from "@playwright/test";
import { catalog, detail, mockApplication } from "./fixtures";

for (const theme of ["light", "dark"]) {
  for (const width of [320, 800, 1440]) {
    test(`squad current form icons and optional failures ${theme} ${width}`, async ({ page }, info) => {
      await mockApplication(page);
      await page.setViewportSize({ width, height: 1000 });
      const animate = theme === "light" && width === 1440;
      if (animate) await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
      const squadCatalog = catalog.map((player) => player.id === "2" ? { ...player, points: 0 }
        : player.id === "6" ? { ...player, points: null } : player);
      await page.route("**/api/players", (route) => route.fulfill({ json: squadCatalog }));
      await page.route("**/api/leagues/l1/teams/t1", (route) => route.fulfill({ json: {
        id: "t1", manager: { managerName: "Demo Manager" }, teamValue: 80_000_000,
        players: squadCatalog.slice(0, 13).map((player) => ({
          playerTeamId: "s" + player.id, buyoutClause: 10_000_000,
          playerMaster: player.id === "8" ? { ...player, positionId: 5 } : player,
        })),
      } }));
      const requested: string[] = [];
      let release: () => void = () => {};
      const ready = new Promise<void>((resolve) => { release = resolve; });
      const ratings = ["bad", "mid", "good", "very_good", "very_bad", null];
      await page.route("**/api/players/*/stats/profile", async (route) => {
        const id = new URL(route.request().url()).pathname.split("/")[3];
        requested.push(id);
        if (id === "7") return route.fulfill({ status: 503, json: { error: "unavailable" } });
        if (id === "13") await ready;
        return route.fulfill({ json: {
          ...detail.profile, playerId: id,
          form: { rating: ratings[Number(id) - 1] ?? null },
          startProbability: { matchweek: 9, percent: [100, 0, 85, null, 120, 50][Number(id) - 1] ?? null },
        } });
      });
      await page.goto("/");
      const tile = (name: string) => page.locator(".squad-grid .player-tile").filter({
        has: page.locator(".player-name-label").getByText(name, { exact: true }),
      });
      await expect(page.getByText("Loading squad stats…", { exact: true })).toBeVisible();
      await expect.poll(() => requested.length).toBe(12);
      await expect(page.locator(".squad-grid--ready")).toHaveCount(0);
      await expect(page.locator(".squad-grid .player-total-points")).toHaveCount(0);
      release();
      // Past fixtures show points, while the badge stays explicitly current form.
      await page.getByRole("button", { name: "Previous fixture", exact: true }).click();
      await expect(tile("Player 01").locator(".player-total-points")).toHaveText("120p");
      await expect(tile("Player 02").locator(".player-total-points")).toHaveText("0p");
      await expect(tile("Player 06").locator(".player-total-points")).toHaveText("—p");
      await expect(tile("Player 01").locator(".player-starter-probability")).toHaveText("100%");
      await expect(tile("Player 02").locator(".player-starter-probability")).toHaveText("0%");
      await expect(tile("Player 03").locator(".player-starter-probability")).toHaveText("85%");
      await expect(tile("Player 04").locator(".player-starter-probability")).toHaveText("—");
      await expect(tile("Player 05").locator(".player-starter-probability")).toHaveText("—");
      await expect(tile("Player 01").locator(".player-starter-probability"))
        .toHaveCSS("background-color", "rgb(16, 189, 0)");
      await expect(tile("Player 02").locator(".player-starter-probability"))
        .toHaveCSS("background-color", "rgb(255, 75, 68)");
      await expect(tile("Player 06").locator(".player-starter-probability"))
        .toHaveCSS("background-color", "rgb(255, 196, 19)");
      await expect(tile("Player 05").locator(".player-starter-probability"))
        .not.toHaveAttribute("data-tone");
      await expect(page.locator(".squad-grid .player-score-badge")).toHaveCount(0);
      await expect(page.locator(".pitch-tile .player-score-badge").first()).toBeVisible();
      await expect(page.locator(".squad-grid--ready"))
        .toHaveCSS("animation-name", animate ? "squad-reveal" : "none");
      await expect.poll(() => page.locator(".squad-grid--ready").evaluate(
        (element) => element.getAnimations().every((animation) => animation.playState === "finished"),
      )).toBe(true);
      for (const [name, label] of [
        ["Player 01", "Poor"], ["Player 02", "Average"], ["Player 03", "Good"],
        ["Player 04", "Very good"], ["Player 05", "Very poor"],
      ]) {
        const card = tile(name);
        await expect(card).toHaveAttribute("aria-label", new RegExp(`Current form: ${label}`));
        const badge = card.locator(".player-form-badge");
        await expect(badge.locator(`.is-${theme}`)).toBeVisible();
        await expect(badge.locator(`.is-${theme === "light" ? "dark" : "light"}`)).toBeHidden();
        const bounds = (await badge.boundingBox())!;
        const nameBounds = (await card.locator(".player-name").boundingBox())!;
        const crest = (await card.locator(".player-badge").boundingBox())!;
        const score = (await card.locator(".player-total-points").boundingBox())!;
        const probability = (await card.locator(".player-starter-probability").boundingBox())!;
        expect(probability.x + probability.width).toBeLessThanOrEqual(bounds.x);
        expect(score.x + score.width).toBeLessThanOrEqual(crest.x);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(nameBounds.y);
        expect(bounds.y).toBeGreaterThanOrEqual(crest.y + crest.height);
        expect(bounds.y).toBeGreaterThanOrEqual(score.y + score.height);
      }
      for (const name of ["Player 06", "Player 07"]) {
        await expect(tile(name)).toHaveAttribute("aria-label", /Current form: Unavailable/);
        await expect(tile(name).locator(".player-form-badge")).toHaveText("—");
      }
      await expect(tile("Player 08").locator(".player-form-badge")).toHaveCount(0);
      await expect(tile("Player 08").locator(".player-starter-probability")).toHaveCount(0);
      await expect(tile("Player 08").locator(".player-total-points")).toHaveText("113p");
      expect([...requested].sort()).toEqual(["1", "2", "3", "4", "5", "6", "7", "9", "10", "11", "12", "13"].sort());
      await expect(page.locator(".pitch-tile .player-form-badge")).toHaveCount(0);
      await tile("Player 02").focus();
      await page.keyboard.press("Tab");
      await expect(tile("Player 03")).toBeFocused();
      await expect(page.getByRole("tooltip")).toContainText("Current form: Good");
      await expect(page.getByRole("tooltip")).toContainText("Current FutbolFantasy rating");
      await expect(page.getByRole("tooltip")).toContainText("Season total: 118 Fantasy points");
      await expect(page.getByRole("tooltip")).toContainText("Starter probability: 85% for F9");
      await page.keyboard.press("Escape");
      await page.locator(".squad-grid").screenshot({ path: info.outputPath("squad-form.png") });
      await tile("Player 07").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.getByRole("button", { name: "Next squad page" }).click();
      await expect(tile("Player 09")).toBeVisible();
      await expect.poll(() => requested.length).toBe(12);
      await page.getByRole("button", { name: "Previous squad page" }).click();
      await expect(tile("Player 03")).toHaveAttribute("aria-label", /Current form: Good/);
      expect(requested.filter((id) => id === "3")).toHaveLength(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
