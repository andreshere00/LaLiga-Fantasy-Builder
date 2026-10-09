import { describe, expect, it } from "vitest";

import {
  fixtureDate,
  matchOutcome,
  newsDate,
  sortMatchesByDate,
  teamMediaFromFixture,
  weatherConditionFromSnapshot,
} from "./playerDetailWidgets";

describe("player detail widget formatters", () => {
  it("matchOutcome_returnsEachSideResultAndHandlesDraws", () => {
    expect(matchOutcome(3, 1)).toBe("win");
    expect(matchOutcome(1, 3)).toBe("loss");
    expect(matchOutcome(0, 0)).toBe("draw");
    expect(matchOutcome(null, 0)).toBe("unknown");
  });

  it("weatherConditionFromSnapshot_mapsOpenWeatherCodesAndFallbackIcons", () => {
    expect(weatherConditionFromSnapshot({ condition_code: 800 })).toBe("clear");
    expect(weatherConditionFromSnapshot({ condition_code: 804 })).toBe("overcast");
    expect(weatherConditionFromSnapshot({ condition_code: 301 })).toBe("drizzle");
    expect(weatherConditionFromSnapshot({ condition_code: 500 })).toBe("rain");
    expect(weatherConditionFromSnapshot({ condition_code: 521 })).toBe("shower_rain");
    expect(weatherConditionFromSnapshot({ condition_code: 511 })).toBe("rain");
    expect(weatherConditionFromSnapshot({ icon: "04n" })).toBe("broken_clouds");
    expect(weatherConditionFromSnapshot({ icon: "unknown" })).toBeNull();
  });

  it("teamMediaFromFixture_resolvesClubCodeAndLeavesUnknownClubsUnmatched", () => {
    expect(teamMediaFromFixture("BAR")?.name).toBe("FC Barcelona");
    expect(teamMediaFromFixture("FC Barcelona")?.badge).toContain("teambadge");
    expect(teamMediaFromFixture("Unknown FC")).toBeNull();
  });

  it("fixtureDate_preservesDateOnlyValuesAndShowsUnknownDates", () => {
    expect(fixtureDate("2026-10-09")).toBe("2026-10-09");
    expect(fixtureDate(null)).toBe("Date TBC");
  });

  it("sortMatchesByDate_ordersRecentAndUpcomingFixturesAndKeepsUnknownDatesLast", () => {
    const matches = [
      { fixture: { date: "2026-10-08" } },
      { fixture: { date: null }, kickoff: "2026-10-10T18:00:00Z" },
      { fixture: {} },
    ];
    expect(sortMatchesByDate(matches, "desc")).toEqual([matches[1], matches[0], matches[2]]);
    expect(sortMatchesByDate(matches, "asc")).toEqual([matches[0], matches[1], matches[2]]);
  });

  it("newsDate_formatsUtcDatesWithoutLocalTimezoneDrift", () => {
    expect(newsDate("2026-10-09T00:30:00+02:00")).toBe("09/10/2026");
    expect(newsDate(null)).toBeNull();
  });
});
