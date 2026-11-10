import { describe, expect, it } from "vitest";
import { recentMatchesFrom } from "./useRecentPoints";

const match = (week: number, date: string, extra: Record<string, unknown> = {}) => ({
  fixture: { competition: "laliga", matchweek: week, date, opponent: "Getafe", isHome: true, homeScore: 2, awayScore: 1, result: "W" },
  fantasyPointsTotal: 12,
  minutesPlayed: 90,
  stats: { goals: { count: 1, fantasyPoints: 10 }, assists: { count: 0, fantasyPoints: 0 }, ...extra },
});

describe("recentMatchesFrom", () => {
  it("recentMatchesFrom_laliga_rows_keep_only_reported_stats_oldest_first", () => {
    const rows = recentMatchesFrom({
      fixtures: [
        match(12, "2026-11-01"),
        { ...match(3, "2026-09-01"), fixture: { competition: "copa_del_rey", date: "2026-09-02" } },
        match(11, "2026-10-25"),
      ],
    });
    expect(rows.map((row) => row.matchweek)).toEqual([11, 12]);
    expect(rows[0].stats.map((stat) => stat.key)).toEqual(["minutesPlayed", "goals"]);
    expect(rows[0]).toMatchObject({ opponent: "Getafe", score: "2-1", result: "W", points: 12 });
  });
  it("recentMatchesFrom_unexpected_payload_is_empty", () => {
    expect(recentMatchesFrom(null)).toEqual([]);
    expect(recentMatchesFrom({ fixtures: "x" })).toEqual([]);
  });
});
