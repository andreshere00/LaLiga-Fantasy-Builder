import { expect, test, type Page } from "@playwright/test";
import { marketFixture, mockApplication } from "./fixtures";

const clubs = {
  clubs: [
    { clubId: 4, name: "FC Barcelona", slug: "barcelona", badgeUrl: null },
    { clubId: 20, name: "Villarreal CF", slug: "villarreal", badgeUrl: null },
  ],
};

const squad = [
  { playerId: "30", name: "Ana", positionId: 4, points: 1, stats: { goals: 0 } },
  { playerId: "31", name: "Zed", positionId: 4, points: 99, stats: { goals: 3 } },
  ...Array.from({ length: 22 }, (_, index) => ({
    playerId: String(index + 40),
    name: `Squad ${index + 1}`,
    positionId: 3,
    points: index,
    stats: { minutes: 90 },
  })),
];

const dossier = {
  club: clubs.clubs[0],
  roster: {
    mvps: [
      { playerId: "31", name: "Zed", points: 99, positionId: 4 },
      { playerId: "30", name: "Ana", points: 1, positionId: 4 },
      { playerId: "40", name: "Squad 1", points: 0, positionId: 3 },
    ],
    players: squad,
    totals: { goals: 3, minutes: 90 },
    coverage: { players: squad.length, matchweeks: [], shortWindow: false },
  },
  performance: {
    matches: [
      {
        matchId: "league",
        competition: "laliga",
        group: "laliga",
        home: "4",
        away: "20",
        venue: "home",
        outcome: "win",
        regulationHome: 2,
        regulationAway: 0,
        scheduled: false,
        kickoff: "2026-10-01T18:00:00Z",
      },
      {
        matchId: "next",
        competition: "laliga",
        group: "laliga",
        home: "4",
        away: "20",
        venue: "home",
        scheduled: true,
        kickoff: "2026-10-18T18:00:00Z",
      },
      {
        matchId: "cup",
        competition: "champions_league",
        group: "european",
        home: "Liverpool",
        away: "FC Barcelona",
        venue: "away",
        outcome: "loss",
        regulationHome: 2,
        regulationAway: 2,
        finalHome: 4,
        finalAway: 5,
        scheduled: false,
        kickoff: "2026-09-20T18:00:00Z",
      },
    ],
    nextMatchId: "next",
  },
  prediction: {
    matchday: 12,
    coach: { name: "Hansi Flick", rotations: "Pocas rotaciones", seasonPredictabilityPercent: 80 },
    starters: [{ name: "Player 01", probability: 90, position: "Forward" }],
    alternatives: [
      { name: "Player 14", probability: 40, position: "Forward" },
      { name: "Mystery Forward", probability: 0, position: "Forward" },
    ],
    summary: { averageProbability: 70, averageFormArrow: 2, substituteRisk: "Bajo" },
  },
  injuries: { published: true, items: [] },
  news: null,
  segmentErrors: [
    { segment: "news", code: "scraping_unavailable", detail: "scraping unavailable" },
    { segment: "performance", code: "scraping_unavailable", detail: "other competitions" },
  ],
};

async function installClubs(page: Page) {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await mockApplication(page);
  await page.route("**/api/clubs", (route) => route.fulfill({ json: clubs }));
  await page.route("**/api/clubs/*", (route) => route.fulfill({ json: dossier }));
  await page.route("**/api/market/leagues/l1", (route) => route.fulfill({
    json: {
      ...marketFixture,
      marketPlayers: marketFixture.marketPlayers.map((item) => (
        item.playerMaster.id === "14"
          ? { ...item, bid: { id: "b14", money: 4_000_000, status: "pending" } }
          : item
      )),
    },
  }));
  return writes;
}

test("club dossier keyboard, filters, and actions", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const writes = await installClubs(page);
  await page.addInitScript(() => localStorage.setItem("lfb-theme", "light"));
  await page.goto("/teams/4?section=performance&competition=european&window=10");
  await page.reload();
  await expect(page.getByRole("button", { name: "European" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "10", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("2 (4) – 2 (5)")).toBeVisible();
  await expect(page.getByText("Other competitions are unavailable.")).toBeVisible();

  await page.getByRole("button", { name: "Domestic" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("No Domestic matches in this window.")).toBeVisible();
  await page.getByRole("button", { name: "Show all competitions", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "All competitions", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Next match")).toBeVisible();

  const clubsNav = page.getByRole("navigation", { name: "Choose a club" });
  await clubsNav.getByRole("link", { name: "Villarreal CF" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/teams\/20/);
  const sections = page.getByRole("navigation", { name: "Club sections" });
  await sections.getByRole("link", { name: "Players" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("No current injuries were published.")).toBeVisible();
  await expect(page.getByText("Matchweek coverage was not published.")).toBeVisible();
  await expect(page.locator(".team-table tbody tr")).toHaveCount(24);
  await page.getByRole("button", { name: "FSYP" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".team-table tbody tr").first().locator("th")).toHaveText("Zed");
  await expect(page.getByText("This section could not be loaded.")).toBeVisible();

  await sections.getByRole("link", { name: "Lineup" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Hansi Flick" })).toBeVisible();
  await expect(page.getByText("0%", { exact: true })).toBeVisible();
  const unresolved = page.locator(".team-xi-player", { hasText: "Mystery Forward" });
  await expect(unresolved.getByText("Fantasy actions are unavailable for this player.")).toBeVisible();
  const owned = page.locator(".team-xi-player", { hasText: "Player 01" });
  await expect(owned.getByRole("link", { name: "Field player" })).toHaveAttribute("href", "/?focusPlayer=1&team=t1");
  const listed = page.locator(".team-xi-player", { hasText: "Player 14" });
  await expect(listed.getByRole("link", { name: "Field player" })).toHaveCount(0);
  await listed.getByRole("button", { name: "Bid placed" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Modify bid" })).toBeVisible();
  await page.keyboard.press("Escape");
  await owned.getByRole("link", { name: "Field player" }).click();
  await expect(page).toHaveURL(/focusPlayer=1/);
  await expect(page.locator("#squad-player-1")).toBeVisible();
  expect(writes.filter((entry) => /bids|lineup|buyout|clause/.test(entry))).toEqual([]);
});

for (const { theme, width } of [
  { theme: "light", width: 375 },
  { theme: "dark", width: 375 },
  { theme: "dark", width: 1440 },
]) {
  test(`club dossier stays readable: ${theme} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await installClubs(page);
    await page.addInitScript((value) => localStorage.setItem("lfb-theme", value), theme);
    await page.goto("/teams/4");
    const labels = ["Lineup", "Market", "Players", "Teams"];
    const boxes = [];
    for (const name of labels) {
      const link = page.locator(".nav-tabs").getByRole("link", { name, exact: true });
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      boxes.push(box!);
      const overflow = await link.evaluate((node) => node.scrollWidth - node.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
    const ordered = [...boxes].sort((left, right) => left.x - right.x);
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index].x).toBeGreaterThanOrEqual(ordered[index - 1].x + ordered[index - 1].width - 1);
    }
    if (width === 375) {
      for (const box of boxes) expect(box.y + box.height).toBeLessThanOrEqual(900);
      const padding = await page.locator(".nav-tabs").evaluate((node) => getComputedStyle(node).paddingBottom);
      expect(padding.endsWith("px")).toBeTruthy();
    }
    await page.screenshot({ path: info.outputPath(`teams-${theme}-${width}.png`) });
  });
}

test("a player's hierarchy link opens the club's level list", async ({ page }) => {
  await installClubs(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/teams/4?section=players#team-hierarchy");
  const levels = page.getByRole("dialog", { name: "Hierarchy levels" });
  await expect(levels).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(levels).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View hierarchy levels" })).toBeFocused();
});

test("the squad tab links to player details and to the club player list", async ({ page }) => {
  await installClubs(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/teams/4?section=players");
  const squadLink = page.locator(".team-table tbody tr th a").first();
  await expect(squadLink).toHaveAttribute("href", /\/players\/\d+/);
  const comparison = page.getByRole("link", { name: /Compare all FC Barcelona players/ });
  await expect(comparison).toHaveAttribute("href", "/players?team=FC+Barcelona");
});
