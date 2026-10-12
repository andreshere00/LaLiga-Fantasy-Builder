// ---- Mocks, fixtures & helpers ---- //
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getJson, paths } from "../../api/client";
import { playerDetailSchema } from "../../api/schemas";
import { PlayerFantasySection } from "./PlayerFantasySection";
import { PlayerMatchesSection } from "./PlayerMatchesSection";
import { mapDetailSegmentBlocks, scoreLabel, statDisplay } from "./playerDetailFormat";
import { weatherConditionFromSnapshot } from "./playerDetailWidgets";

const envelope = { player_id: "3104", season: "2026-27", generated_at: "2026-10-12T12:00:00Z" };
const fixture = { competition: "laliga", competition_label: "LaLiga", home_team: "BAR", away_team: "RMA", home_score: 2, away_score: 1 };
const wireResponse = {
  ...envelope,
  player: { id: "3104", team_name: "FC Barcelona", position_id: 3 },
  fixtures: { ...envelope, fixtures: [{ fixture, minutes_played: 90, fantasy_points_total: 8,
    stats: { minutes_played: { count: 90, fantasy_points: 2 }, dazn_points: { dazn_points: 3 } } }] },
  market: { ...envelope, current_value: 120, presets: [],
    window: { from: "2026-10-01", to: "2026-10-12", days: 12, delta_abs: 20, delta_rel: 20, series: [] } },
  recent: { ...envelope, matches: [{ fixture, minutes: { minutes: 90 }, fantasy_points_total: 8 }] },
  upcoming: { ...envelope, matches: [{ fixture: { ...fixture, home_score: null, away_score: null },
    weather: { snapshot: { temperature_c: 19.79, feels_like_c: 20.31, humidity_pct: 95,
      wind_speed_ms: 4.28, condition: "Rain", condition_code: 500, forecast_for: "2026-10-13T12:00:00Z" } },
    travel: { mode: "great_circle" } }] },
  profile: { ...envelope, injury: { availability_text: "Available" },
    start_probability: { percent: 80, matchweek: 9 }, injury_risk: { level: "low" },
    injury_history: [{ diagnosis: "Ankle injury", duration_days: 10 }], max_profitable_bid: {},
    hierarchy: { label: "Key" }, news: [{ title: "Training news", published_at: "2026-10-10T12:00:00Z" }], averages: [] },
  segment_errors: [],
};
afterEach(cleanup);
// ---- Happy path ---- //
describe("validated player detail consumers", () => {
  it("renders Python wire data after the real client normalizes declared fields", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(wireResponse), { status: 200 }));
    const response = await getJson(paths.playerStatsDetail("3104"), "token", { fetchFn });
    const detail = playerDetailSchema.parse(response);
    expect(response).toEqual(detail);
    expect(detail.player.teamName).toBe("FC Barcelona");
    expect(detail.market?.currentValue).toBe(120);
    expect(detail.market?.window.deltaAbs).toBe(20);
    expect(detail.segmentErrors).toEqual([]);
    const row = detail.fixtures!.fixtures[0];
    expect(scoreLabel(row.fixture)).toBe("2-1");
    expect(statDisplay(row.stats.minutesPlayed, "minutesPlayed")).toBe("90 (2 p)");
    expect(statDisplay(row.stats.daznPoints, "daznPoints")).toBe("3");
    render(<><PlayerFantasySection profile={detail.profile!} />
      <PlayerMatchesSection
        recent={detail.recent!}
        upcoming={detail.upcoming!}
        playerTeamName={detail.player.teamName ?? null}
      /></>);
    expect(screen.getByText("80%")).toBeTruthy();
    expect(screen.getByText("Matchday 9")).toBeTruthy();
    expect(screen.getByText("Ankle injury · 10 days")).toBeTruthy();
    expect(screen.getByText("10/10/2026 ·", { exact: false })).toBeTruthy();
    expect(screen.getAllByText("FC Barcelona")).toHaveLength(2);
    expect(screen.getAllByText("Real Madrid")).toHaveLength(2);
    expect(screen.getByText("Low")).toBeTruthy();
    expect(screen.getByText("Temperature: 19.79°C (20.31°C)")).toBeTruthy();
    expect(screen.getByText("Humidity: 95%")).toBeTruthy();
    expect(screen.getByText("Wind: 15.4 km/h")).toBeTruthy();
  });
  it("uses normalized segment errors and weather fields", () => {
    const blocks = mapDetailSegmentBlocks({ fixtures: {}, market: {}, profile: {}, segmentErrors: [{ segment: "market" }] });
    expect(blocks.market).toBeNull();
    expect(blocks.fixtures).toEqual({});
    expect(weatherConditionFromSnapshot({ conditionCode: 800 })).toBe("clear");
  });
});
