import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";

export const standingsFixture = JSON.parse(
  readFileSync(resolve(process.cwd(), "../contracts/standings-response.json"), "utf8"),
).payload;

/** Fictional, deterministic account data; browser checks never reach a real backend. */
export const catalog = Array.from({ length: 65 }, (_, index) => ({
  id: String(index + 1), nickname: "Player " + String(index + 1).padStart(2, "0"),
  positionId: index === 0 ? 1 : index < 5 ? 2 : index < 8 ? 3 : index < 11 ? 4 : index % 4 + 1,
  teamId: 1, team: { id: "1", name: "FC Barcelona" }, playerStatus: "available",
  points: 120 - index, averagePoints: 5.4, marketValue: 2000000 + index * 100000,
  lastStats: [5, 6, 7].map((weekNumber) => ({ weekNumber, totalPoints: 6, stats: { mins_played: [90, 2] } })),
}));
const slots = catalog.slice(0, 13).map((player, index) => ({
  playerTeamId: "s" + player.id, playerMaster: player, buyoutClause: 10000000,
  playerMarket: index === 12 ? { id: "own-listing", money: 3000000 } : null,
}));
const team = { id: "t1", manager: { managerName: "Demo Manager" }, teamMoney: 50000000,
  teamValue: 80000000, playersNumber: slots.length, players: slots };
const league = { id: "l1", name: "Demo League", team: { id: "t1", money: 50000000,
  playersNumber: slots.length, teamValue: 80000000, manager: { managerName: "Demo Manager" } } };
const lineup = { teamId: "t1", weekNumber: 8, formation: {
  tacticalFormation: [4, 3, 3], goalkeeper: slots.slice(0, 1), defender: slots.slice(1, 5),
  midfield: slots.slice(5, 8), striker: slots.slice(8, 11), coach: [], captain: "s9",
} };
const envelope = { playerId: "1", season: "2026-27", generatedAt: "2026-10-12T12:00:00Z" };
const match = { competition: "laliga", competitionLabel: "LaLiga", homeTeam: "BAR", awayTeam: "RMA",
  date: "2026-10-10T16:00:00Z", matchweek: 7, homeScore: 2, awayScore: 1, result: "W" };
export const detail = {
  ...envelope, player: { id: "1", name: "Player 01", teamName: "FC Barcelona", positionId: 1 },
  fixtures: { ...envelope, fixtures: [1, 2, 3].map((i) => ({ fixture: { ...match, matchweek: i + 4 },
    minutesPlayed: 90, fantasyPointsTotal: 8, stats: { saves: { count: 3 }, daznPoints: { daznPoints: 2 } } })) },
  market: { ...envelope, currentValue: 2100000, presets: [], currency: "EUR",
    window: { from: "2026-10-01", to: "2026-10-12", days: 12, deltaAbs: 100000, deltaRel: 5,
      series: Array.from({ length: 12 }, (_, index) => ({ date: "2026-10-" + String(index + 1).padStart(2, "0"), value: 2000000 + index * 10000 })) } },
  recent: { ...envelope, matches: [{ fixture: match, minutes: { minutes: 90 }, fantasyPointsTotal: 8 }] },
  upcoming: { ...envelope, matches: [{ fixture: { ...match, date: "2026-10-15T18:00:00Z", homeScore: null, awayScore: null, result: null },
    kickoff: "2026-10-15T18:00:00Z", weather: { reason: "beyond_forecast_horizon" }, travel: {} }] },
  profile: { ...envelope, injury: { availabilityText: "Available" }, form: { rating: "good", value: 6 },
    startProbability: { percent: 85, matchweek: 8 }, injuryRisk: { level: "low" }, maxProfitableBid: {},
    hierarchy: { label: "Key" }, averages: ["DE", "PI", "BR", "-Pos", "S", "GC"].map((code, index) => ({ code, label: ["Effective clearances", "Interceptions", "Balls recovered", "Possessions lost", "Saves", "Goals conceded"][index], value: index + 0.5 })),
    news: Array.from({ length: 21 }, (_, index) => ({ title: "Training report " + (index + 1) + ": a longer headline to check wrapping and source attribution",
      publishedAt: "2026-10-" + String(index + 1).padStart(2, "0") + "T12:00:00Z", source: "Demo source", url: "https://example.com/news/" + index })),
    injuryHistory: Array.from({ length: 8 }, (_, index) => ({ diagnosis: "Recorded injury " + (index + 1),
      start: "2026-01-" + String(index + 1).padStart(2, "0"), end: "2026-02-01", durationDays: 10 })) },
  segmentErrors: [],
};

export const marketFixture = { userBids: [], marketPlayers: catalog.slice(13, 20).map((player) => ({ id: "m" + player.id, leagueId: "l1", playerMaster: player, expirationDate: "2026-10-13T15:00:00Z" })) };

export async function mockApplication(page: Page, { rankingSize = 2 } = {}) {
  await page.clock.setFixedTime(new Date("2026-10-12T12:00:00Z"));
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:3100") return route.abort();
    const p = url.pathname;
    let body: unknown;
    if (p === "/auth/get-session") body = { user: { id: "demo", name: "Demo Manager", email: "demo@example.com", emailVerified: true, createdAt: "2026-10-12T12:00:00Z", updatedAt: "2026-10-12T12:00:00Z" }, session: { id: "fixture-session", userId: "demo", token: "synthetic-session", expiresAt: "2026-10-13T12:00:00Z", createdAt: "2026-10-12T12:00:00Z", updatedAt: "2026-10-12T12:00:00Z" } };
    else if (p === "/auth/token") body = { token: `fixture.${Buffer.from(JSON.stringify({ sub: "demo", iat: 1791806400, exp: 1791807300 })).toString("base64url")}.signature` };
    else if (p === "/laliga/connection") body = { linked: true, needsReauth: false, managerId: "demo", managerName: "Demo Manager", avatar: null };
    else if (!p.startsWith("/api/")) return route.continue();
    else if (request.method() !== "GET") body = p.includes("lineup") ? lineup : { ok: true, id: "fixture-bid" };
    else if (p === "/api/leagues") body = [league];
    else if (/^\/api\/competitions\/\d+\/standings$/.test(p)) body = standingsFixture;
    else if (p.includes("/standing")) body = Array.from({ length: rankingSize }, (_, index) => ({
      position: index + 1, points: 85 - index * 5,
      team: index === 0 ? team : { id: "t" + (index + 1), manager: {
        managerName: index === 1 ? "Another Manager" : "Manager " + (index + 1),
      } },
    }));
    else if (p === "/api/calendar/current") body = { weekNumber: 8, previousWeek: 7, nextWeek: 9, isLive: true, openingWeekDate: "2026-10-10T00:00:00Z" };
    else if (p.startsWith("/api/calendar/")) body = [];
    else if (p === "/api/players") body = catalog;
    else if (p.endsWith("/stats/detail")) body = detail;
    else if (p.endsWith("/market-value")) body = [{ date: "2026-10-07", marketValue: 2000000 }, { date: "2026-10-12", marketValue: 2100000 }];
    else if (p.includes("/players/") && p.includes("/league/")) body = slots[0];
    else if (p === "/api/market/leagues/l1") body = marketFixture;
    else if (/\/player-teams\/[^/]+\/offers$/.test(p)) body = { offers: [] };
    else if (p.endsWith("/teams")) body = [team];
    else if (p.includes("/lineup")) body = lineup;
    else if (p.endsWith("/money")) body = { teamMoney: 50000000 };
    else if (p.includes("/teams/")) body = team;
    else return route.fulfill({ status: 404, json: { error: "fixture_missing", detail: p } });
    await route.fulfill({ json: body });
  });
}

/** Stateful synthetic market: mutations affect subsequent reads, with optional lag/failure. */
export async function mockMarketBids(page: Page) {
  await mockApplication(page);
  const bids = new Map<string, { id: string; money: number; status: string }>([
    ["m14", { id: "b14", money: 4_000_000, status: "pending" }],
    ["m15", { id: "b15", money: 5_000_000, status: "pending" }],
  ]);
  let staleReads = 0;
  let stale: unknown = null;
  let failReads = false;
  let failCancel = false;
  const writes: { method: string; path: string; body: unknown }[] = [];
  function snapshot() {
    return { marketPlayers: marketFixture.marketPlayers.map((item, index) => ({
      ...item, numberOfBids: (index < 2 ? 1 : 0) + Number(bids.has(item.id)),
      ...(bids.has(item.id) ? { bid: bids.get(item.id) } : {}),
      ...(index < 2 ? {
        playerTeam: { playerTeamId: `opponent-${index}`, teamId: "t2", buyoutClause: 12_000_000,
          isShielded: index === 0, buyoutClauseLockedEndTime: "2026-10-12T12:00:30Z" },
        sellerTeam: { id: "t2", manager: { managerName: "Other Manager" } },
      } : {}),
    })), userBids: [
      ...[...bids].map(([marketId, bid]) => ({ ...bid, marketId })),
      { id: "hidden-bid", marketId: "hidden-listing", money: 2_000_000, status: "pending",
        expirationDate: "2026-10-14T12:00:00Z", playerMaster: catalog[21] },
    ] };
  }
  await page.route("**/api/market/leagues/l1", (route) => {
    if (failReads) return route.fulfill({ status: 502, json: { error: "fantasy_error" } });
    if (staleReads > 0 && stale != null) { staleReads--; return route.fulfill({ json: stale }); }
    return route.fulfill({ json: snapshot() });
  });
  await page.route("**/api/market/leagues/l1/*/bids{,/**}", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const marketId = path.split("/")[5];
    const method = request.method();
    writes.push({ method, path, body: request.postDataJSON() });
    if (failCancel && method === "DELETE") {
      return route.fulfill({ status: 400, json: { error: "bid_not_cancelled" } });
    }
    stale = snapshot();
    if (method === "DELETE") bids.delete(marketId);
    else bids.set(marketId, { id: bids.get(marketId)?.id ?? `created-${marketId}`,
      money: request.postDataJSON().money, status: "pending" });
    await route.fulfill({ json: { ok: true } });
  });
  return { writes,
    lag: (count: number) => { staleReads = count; },
    failRead: (value: boolean) => { failReads = value; },
    rejectCancellation: (value: boolean) => { failCancel = value; },
  };
}
