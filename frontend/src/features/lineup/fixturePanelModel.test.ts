// ---- Mocks, fixtures & helpers ---- //
import { describe, expect, it } from "vitest";
import type { CurrentWeekDto, FixturesDto, WeekWeatherDto } from "../../api/schemas";
import { kickoffTimestamp, normalizeRound, retainWeatherForecasts, selectFixtureRound, validWeek, weatherMatchesFixture } from "./fixturePanelModel";

const now = Date.parse("2026-10-20T12:00:00Z");
function fixtures(state = 1, week = 10): FixturesDto {
  return Array.from({ length: 10 }, (_, index) => ({
    id: `${week}-${index}`, localId: index * 2 + 1, visitorId: index * 2 + 2,
    matchState: state, matchDate: state === 7 ? "2026-10-18T18:00:00+02:00" : "2026-10-24T18:00:00+02:00",
    localScore: 0, visitorScore: 0,
  }));
}
const metadata: CurrentWeekDto = { weekNumber: 10, previousWeek: 9, nextWeek: 11, isLive: false };
const round = (rows: FixturesDto) => normalizeRound(rows, now)!;

// ---- Happy path ---- //
describe("fixture panel round selection", () => {
  it("shows the unstarted current week rather than skipping to nextWeek", () => {
    const selected = selectFixtureRound(metadata, new Map([[9, round(fixtures(7, 9))], [10, round(fixtures())]]));
    expect(selected).toEqual({ week: 10, mode: "upcoming", nextWeek: null });
  });

  it("keeps an unfinished round between games when isLive is false", () => {
    const rows = fixtures(); rows[0] = fixtures(7)[0];
    expect(selectFixtureRound(metadata, new Map([[10, round(rows)]])))
      .toEqual({ week: 10, mode: "active", nextWeek: null });
  });

  it("waits on the completed round during next-week loading or failure", () => {
    expect(selectFixtureRound(metadata, new Map([[10, round(fixtures(7))]])))
      .toEqual({ week: 10, mode: "finished", nextWeek: 11 });
  });

  it("switches to the next week without waiting for metadata rollover", () => {
    expect(selectFixtureRound(metadata, new Map([[10, round(fixtures(7))], [11, round(fixtures(1, 11))]])))
      .toEqual({ week: 11, mode: "upcoming", nextWeek: null });
  });

  it("renders the real active state when the next week has already started", () => {
    const next = fixtures(1, 11); next[0] = fixtures(7, 11)[0];
    expect(selectFixtureRound(metadata, new Map([[10, round(fixtures(7))], [11, round(next)]]))?.mode).toBe("active");
  });

  it("retains the previous active round across an early calendar pointer advance", () => {
    const previous = fixtures(7, 9); previous[9] = fixtures(1, 9)[9];
    expect(selectFixtureRound(metadata, new Map([[9, round(previous)], [10, round(fixtures())]]))?.week).toBe(9);
    const started = fixtures(); started[0] = fixtures(7)[0];
    expect(selectFixtureRound(metadata, new Map([[9, round(previous)], [10, round(started)]]))?.week).toBe(10);
  });
  it("retains completed results while an advanced pointer's schedule is loading, empty, or failed", () => {
    for (const currentRound of [undefined, round([])]) {
      expect(selectFixtureRound(metadata, new Map([[9, round(fixtures(7, 9))], [10, currentRound]])))
        .toEqual({ week: 9, mode: "finished", nextWeek: 10 });
    }
  });

  // ---- Error paths ---- //
  it("does not infer completion from an empty, partial, or conflicting snapshot", () => {
    const finished = fixtures(7);
    for (const rows of [[], finished.slice(0, 9), [...finished, { ...finished[0], localScore: 3 }]]) {
      expect(round(rows).complete).toBe(false);
    }
    expect(round([...finished, { ...finished[0] }]).complete).toBe(true);
    expect(round(finished.map((item) => ({ ...item, localId: 1 }))).complete).toBe(false);
  });

  it("does not mistake unknown/postponed states or a 0–0 score for completion", () => {
    const rows = fixtures(7); rows[9].matchState = 99;
    expect(round(rows).complete).toBe(false);
    expect(round(rows).matches[9].status).toBe("unconfirmed");
  });

  // ---- Edge cases ---- //
  it("hides scheduled score placeholders but preserves an actual final zero", () => {
    expect(round(fixtures()).matches[0].homeScore).toBeNull();
    expect(round(fixtures(7)).matches[0].homeScore).toBe(0);
  });

  it("handles unknown club identities without dropping the match", () => {
    const rows = fixtures(); rows[0].localId = 99999;
    expect(round(rows).matches[0].home.name).toBe("Club 99999");
  });

  it("finishes the season without inventing week 39 or week 1", () => {
    expect(selectFixtureRound({ weekNumber: 38, nextWeek: 39 }, new Map([[38, round(fixtures(7, 38))]])))
      .toEqual({ week: 38, mode: "season-complete", nextWeek: null });
    expect(selectFixtureRound({}, new Map())).toBeNull();
    expect([0, 39, 1.5, NaN, "10"].map(validWeek)).toEqual([null, null, null, null, null]);
  });

  it("requires offset-aware kickoff times and respects the Madrid DST boundary", () => {
    expect(kickoffTimestamp("2026-10-24")).toBeNull();
    expect(kickoffTimestamp("2026-10-24T18:00:00")).toBeNull();
    expect(kickoffTimestamp("garbage")).toBeNull();
    expect(kickoffTimestamp("2026-02-30T18:00:00+02:00")).toBeNull();
    expect(kickoffTimestamp("2026-10-24T18:00:00+02:00")).toBe(Date.parse("2026-10-24T16:00:00Z"));
    expect(kickoffTimestamp("2026-10-25T18:00:00+01:00")).toBe(Date.parse("2026-10-25T17:00:00Z"));
  });
});

describe("fixture weather identity", () => {
  const old: WeekWeatherDto = {
    weekNumber: 10, generatedAt: "2026-10-20T12:00:00Z", matches: [{
      fixtureId: "10-0", localId: 1, visitorId: 2, kickoff: "2026-10-24T16:00:00Z",
      fetchedAt: "2026-10-20T12:00:00Z",
      weather: { snapshot: { temperatureC: 0, condition: "clear", forecastFor: "2026-10-24T15:00:00Z" } },
    }],
  };
  it("preserves a pre-kickoff forecast as a saved snapshot during play", () => {
    const incoming = { ...old, matches: [{ ...old.matches[0], weather: { snapshot: null, reason: "match_started" } }] };
    expect(retainWeatherForecasts(old, incoming).matches[0]).toEqual(old.matches[0]);
  });
  it("retains an explicitly stale forecast when one venue fails during a successful aggregate", () => {
    const incoming = { ...old, matches: [{ ...old.matches[0], fetchedAt: null, weather: { snapshot: null, reason: "provider_unavailable" } }] };
    const kept = retainWeatherForecasts(old, incoming).matches[0];
    expect(kept.weather.snapshot?.temperatureC).toBe(0);
    expect(kept.weather.reason).toBe("provider_unavailable");
    expect(kept.fetchedAt).toBe(old.matches[0].fetchedAt);
  });
  it("rejects old weather when a match is rescheduled or club identity changes", () => {
    const incoming = { ...old, matches: [{ ...old.matches[0], kickoff: "2026-10-25T16:00:00Z", weather: { snapshot: null, reason: "match_started" } }] };
    expect(retainWeatherForecasts(old, incoming).matches[0].weather.snapshot).toBeNull();
    const item = round(fixtures()).matches[0];
    expect(weatherMatchesFixture(old.matches[0], item)).toBe(true);
    expect(weatherMatchesFixture({ ...old.matches[0], localId: 999 }, item)).toBe(false);
  });
});
