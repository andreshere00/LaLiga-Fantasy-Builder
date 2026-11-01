// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import {
  daznPointsForMatchweek,
  fixtureScoreLineLabel,
  fixtureScoreLinesByMasterId,
  readFixtureScoreLines,
  withDaznScoreLine,
} from "./fixtureScoreLines";

const weekRow = {
  weekNumber: 8,
  stats: {
    mins_played: [90, 2],
    goals: [0, 0],
    goals_conceded: [1, -1],
    marca_points: [-1, 3],
  },
};

// ---- Happy path ---- //

describe("fixtureScoreLines", () => {
  it("readFixtureScoreLines_nested_pair_returns_events_that_change_the_score", () => {
    const lines = readFixtureScoreLines({ id: "10", lastStats: [weekRow] }, 8);

    expect(lines).toEqual([
      { key: "mins_played", label: "Minutes", count: 90, points: 2 },
      { key: "goals_conceded", label: "Goals conceded", count: 1, points: -1 },
    ]);
    expect(lines?.some((line) => line.key === "marca_points")).toBe(false);
    expect(lines?.map(fixtureScoreLineLabel)).toEqual([
      "Minutes, 90, +2 points",
      "Goals conceded, 1, -1 point",
    ]);
  });

  it("readFixtureScoreLines_object_stat_reads_count_and_points", () => {
    expect(readFixtureScoreLines({
      id: "10",
      stats: { mins_played: { count: 70, points: 2 }, goals: { count: 1, fantasyPoints: 4 } },
    }, 8)).toEqual([
      { key: "mins_played", label: "Minutes", count: 70, points: 2 },
      { key: "goals", label: "Goals", count: 1, points: 4 },
    ]);
  });

  it("fixtureScoreLinesByMasterId_lineup_week_overrides_an_older_roster_row", () => {
    const roster = {
      players: [{
        playerMaster: {
          id: "10",
          lastStats: [{ weekNumber: 8, stats: { mins_played: [90, 2], goals: [1, 4] } }],
        },
      }],
    };
    const lineup = {
      formation: {
        striker: [{
          playerMaster: {
            id: "10",
            lastStats: [{ weekNumber: 8, stats: { mins_played: [80, 2], goals: [0, 0] } }],
          },
        }],
      },
    };

    expect(fixtureScoreLinesByMasterId(8, [roster, lineup]).get("10")).toEqual([
      { key: "mins_played", label: "Minutes", count: 80, points: 2 },
    ]);
  });

  it("readFixtureScoreLines_daznPointsObject_usesTheRatingAsTheCount", () => {
    const lines = readFixtureScoreLines({
      id: "10",
      lastStats: [{
        weekNumber: 8,
        stats: {
          mins_played: [90, 2],
          daznPoints: { count: 4, fantasyPoints: 9, daznPoints: 3 },
          marca_points: [-1, 3],
          unknown_stat: [1, 5],
        },
      }],
    }, 8);

    expect(lines).toEqual([
      { key: "mins_played", label: "Minutes", count: 90, points: 2 },
      { key: "daznPoints", label: "DAZN", count: 3, points: 3 },
    ]);
    expect(lines?.map(fixtureScoreLineLabel)).toEqual([
      "Minutes, 90, +2 points",
      "DAZN, 3, +3 points",
    ]);
  });

  it("readFixtureScoreLines_daznWeekPair_readsCountAndPoints", () => {
    expect(readFixtureScoreLines({
      id: "10",
      playerStats: [{ weekNumber: 8, stats: { dazn_points: [1, -2] } }],
    }, 8)).toEqual([
      { key: "dazn_points", label: "DAZN", count: 1, points: -2 },
    ]);
  });

  it("readFixtureScoreLines_oneElementDaznArray_usesTheRatingAsTheCount", () => {
    expect(readFixtureScoreLines({
      id: "3",
      stats: { mins_played: [90, 2], dazn_points: [3] },
    }, 8)).toEqual([
      { key: "mins_played", label: "Minutes", count: 90, points: 2 },
      { key: "dazn_points", label: "DAZN", count: 3, points: 3 },
    ]);
  });

  it("readFixtureScoreLines_daznPointsField_usesTheRatingAsTheCount", () => {
    expect(readFixtureScoreLines({
      id: "3",
      stats: { daznPoints: { points: 2 } },
    }, 8)).toEqual([
      { key: "daznPoints", label: "DAZN", count: 2, points: 2 },
    ]);
  });

  it("readFixtureScoreLines_bareDaznNumber_usesTheRatingAsTheCount", () => {
    expect(readFixtureScoreLines({
      id: "3",
      stats: { daznPoints: 4 },
    }, 8)).toEqual([
      { key: "daznPoints", label: "DAZN", count: 4, points: 4 },
    ]);
  });

  // ---- Edge cases ---- //

  it("readFixtureScoreLines_missing_week_stays_unset", () => {
    expect(readFixtureScoreLines({ id: "10", lastStats: [weekRow] }, 7)).toBeUndefined();
  });

  it("readFixtureScoreLines_week_without_scoring_events_is_empty", () => {
    expect(readFixtureScoreLines({
      id: "10",
      lastStats: [{ weekNumber: 8, stats: { mins_played: [0, 0], goals: [0, 0] } }],
    }, 8)).toEqual([]);
  });

  it("readFixtureScoreLines_zeroOrBlankDazn_omitsTheRow", () => {
    expect(readFixtureScoreLines({
      id: "10",
      stats: { mins_played: [90, 2], daznPoints: { daznPoints: 0 } },
    }, 8)).toEqual([
      { key: "mins_played", label: "Minutes", count: 90, points: 2 },
    ]);
    expect(readFixtureScoreLines({
      id: "10",
      stats: { mins_played: [90, 2], daznPoints: { daznPoints: null, count: 4 } },
    }, 8)).toEqual([
      { key: "mins_played", label: "Minutes", count: 90, points: 2 },
    ]);
  });

  it("daznPointsForMatchweek_reads_the_details_fixture_value", () => {
    const payload = {
      fixtures: [
        { fixture: { competition: "champions_league", matchweek: 8 },
          stats: { daznPoints: { daznPoints: 9 } } },
        { fixture: { competition: "laliga", matchweek: 7 },
          stats: { daznPoints: { daznPoints: 4 } } },
        { fixture: { competition: "laliga", matchweek: 8 },
          stats: { daznPoints: { daznPoints: 1 } } },
      ],
    };

    expect(daznPointsForMatchweek(payload, 8)).toBe(1);
    expect(daznPointsForMatchweek(payload, 3)).toBeNull();
    expect(withDaznScoreLine([
      { key: "mins_played", label: "Minutes", count: 90, points: 2 },
      { key: "dazn_points", label: "DAZN", count: 1, points: 5 },
    ], 1)).toEqual([
      { key: "mins_played", label: "Minutes", count: 90, points: 2 },
      { key: "daznPoints", label: "DAZN", count: 1, points: 1 },
    ]);
    expect(withDaznScoreLine([
      { key: "daznPoints", label: "DAZN", count: null, points: 5 },
    ], 0)).toEqual([]);
    expect(withDaznScoreLine([
      { key: "mins_played", label: "Minutes", count: 90, points: 2 },
    ], null)).toEqual([
      { key: "mins_played", label: "Minutes", count: 90, points: 2 },
    ]);
  });

  it("fixtureScoreLinesByMasterId_reads_calendar_players_for_that_match", () => {
    const stats = [{
      local: { players: [{ id: "3", stats: { mins_played: [90, 2] } }] },
      visitor: { players: [] },
    }];

    expect(fixtureScoreLinesByMasterId(8, [stats]).get("3")).toEqual([
      { key: "mins_played", label: "Minutes", count: 90, points: 2 },
    ]);
  });
});
