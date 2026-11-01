// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import {
  fixtureHighlightLabel,
  fixtureHighlightsByMasterId,
  fixturesStillInPlay,
  lineupFixtureHighlightsVisible,
  readFixtureHighlight,
} from "./fixtureHighlight";

const playedWeek = {
  weekNumber: 8,
  stats: {
    mins_played: [90, 2],
    goals: [1, 4],
    goals_conceded: [0, 1],
  },
};

function master(
  positionId: number,
  stats: Record<string, unknown>,
  weekNumber = 8,
) {
  return {
    id: "10",
    positionId,
    lastStats: [{ weekNumber, stats }],
  };
}

// ---- Happy path ---- //

describe("fixtureHighlight", () => {
  it("readFixtureHighlight_scorer_returns_goal_count", () => {
    expect(readFixtureHighlight(master(4, playedWeek.stats), 8)).toEqual({
      kind: "goal",
      goals: 1,
    });
  });

  it("readFixtureHighlight_goalkeeper_without_a_goal_against_returns_clean_sheet", () => {
    const keeper = master(1, {
      mins_played: [90, 2],
      goals: [0, 0],
      goals_conceded: [0, 4],
    });

    expect(readFixtureHighlight(keeper, 8)).toEqual({
      kind: "clean-sheet",
      goals: 0,
    });
    expect(fixtureHighlightLabel(readFixtureHighlight(keeper, 8))).toBe(
      "No goals conceded",
    );
  });

  it("fixtureHighlightLabel_several_goals_uses_the_count", () => {
    expect(fixtureHighlightLabel({ kind: "goal", goals: 2 })).toBe("Scored 2 goals");
  });

  it("lineupFixtureHighlightsVisible_started_or_previous_week_is_visible", () => {
    expect(lineupFixtureHighlightsVisible(7, 8, [])).toBe(true);
    expect(lineupFixtureHighlightsVisible(8, 8, [{ matchState: 2 }])).toBe(true);
    expect(lineupFixtureHighlightsVisible(8, 8, [{ matchState: 7 }])).toBe(true);
  });

  it("fixtureHighlightsByMasterId_lineup_week_overrides_roster_stats", () => {
    const roster = {
      players: [{
        playerMaster: master(4, { mins_played: [70, 2], goals: [1, 4], goals_conceded: [0, 0] }),
      }],
    };
    const lineup = {
      formation: {
        striker: [{
          playerMaster: {
            ...master(4, { mins_played: [70, 2], goals: [0, 0], goals_conceded: [0, 0] }),
            id: "10",
          },
        }],
      },
    };

    expect(fixtureHighlightsByMasterId(8, [roster, lineup]).has("10")).toBe(false);
  });

  // ---- Error paths ---- //

  it("readFixtureHighlight_missing_week_does_not_invent_a_highlight", () => {
    expect(readFixtureHighlight(master(4, playedWeek.stats, 7), 8)).toBeUndefined();
    expect(readFixtureHighlight({ id: "10", positionId: 4 }, 8)).toBeUndefined();
  });

  it("lineupFixtureHighlightsVisible_future_or_unstarted_week_is_hidden", () => {
    expect(lineupFixtureHighlightsVisible(9, 8, [{ matchState: 7 }])).toBe(false);
    expect(lineupFixtureHighlightsVisible(8, 8, [{ matchState: 1 }])).toBe(false);
    expect(lineupFixtureHighlightsVisible(8, 8, [])).toBe(false);
  });

  // ---- Edge cases ---- //

  it("readFixtureHighlight_unused_or_beaten_goalkeeper_stays_plain", () => {
    const unused = master(1, {
      mins_played: [0, 0],
      goals: [0, 0],
      goals_conceded: [0, 0],
    });
    const beaten = master(1, {
      mins_played: [90, 2],
      goals: [0, 0],
      goals_conceded: [2, -2],
    });

    expect(readFixtureHighlight(unused, 8)).toBeNull();
    expect(readFixtureHighlight(beaten, 8)).toBeNull();
  });

  it("readFixtureHighlight_scoring_goalkeeper_prefers_the_goal", () => {
    const keeper = master(1, {
      mins_played: [90, 2],
      goals: [1, 10],
      goals_conceded: [1, -1],
    });

    expect(readFixtureHighlight(keeper, 8)).toEqual({ kind: "goal", goals: 1 });
  });

  it("readFixtureHighlight_ignores_points_only_arrays_and_own_goals", () => {
    const player = master(4, {
      mins_played: [90],
      goals: [4],
      own_goals: [1, -2],
      goals_conceded: [0, 0],
    });

    expect(readFixtureHighlight(player, 8)).toBeNull();
  });

  it("readFixtureHighlight_goalkeeper_hint_covers_a_missing_position", () => {
    const keeper = {
      id: "1",
      lastStats: [{
        weekNumber: 8,
        stats: { mins_played: [90, 2], goals: [0, 0], goals_conceded: [0, 4] },
      }],
    };

    expect(readFixtureHighlight(keeper, 8, true)?.kind).toBe("clean-sheet");
    expect(readFixtureHighlight(keeper, 8, false)).toBeNull();
  });

  it("fixturesStillInPlay_requires_a_match_that_is_not_finished", () => {
    expect(fixturesStillInPlay([])).toBe(false);
    expect(fixturesStillInPlay([{ matchState: 1 }])).toBe(false);
    expect(fixturesStillInPlay([{ matchState: 7 }])).toBe(false);
    expect(fixturesStillInPlay([{ matchState: 2 }, { matchState: 7 }])).toBe(true);
  });

  it("fixtureHighlightsByMasterId_ignores_a_lineup_week_that_omits_goals", () => {
    const roster = {
      players: [{
        playerMaster: master(4, { mins_played: [80, 2], goals: [1, 4], goals_conceded: [0, 0] }),
      }],
    };
    const lineup = {
      formation: {
        striker: [{
          playerMaster: master(4, { mins_played: [80, 2] }),
        }],
      },
    };

    expect(fixtureHighlightsByMasterId(8, [roster, lineup]).get("10")).toEqual({
      kind: "goal",
      goals: 1,
    });
  });

  it("fixtureHighlightsByMasterId_keeps_roster_highlight_when_lineup_has_no_week", () => {
    const roster = {
      players: [{
        playerMaster: master(4, { mins_played: [80, 2], goals: [2, 8], goals_conceded: [0, 0] }),
      }],
    };
    const lineup = { formation: { striker: [{ playerMaster: { id: "10", positionId: 4 } }] } };

    expect(fixtureHighlightsByMasterId(8, [roster, lineup]).get("10")).toEqual({
      kind: "goal",
      goals: 2,
    });
  });
});
