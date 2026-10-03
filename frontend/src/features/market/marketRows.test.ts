import { describe, expect, it } from "vitest";

import {
  formDisplayPoints,
  formFromCalendarWeeks,
  formPoints,
  formRecentPoints,
  formRecentWeekNumbers,
  formRecentWindow,
  formWindowChronological,
  marketRow,
  recentFormWeekNumbers,
} from "./marketRows";

describe("form helpers", () => {
  it("formPoints_sums_last_five_matchweeks", () => {
    const lastStats = [
      { weekNumber: 3, totalPoints: 2 },
      { weekNumber: 7, totalPoints: 8 },
      { weekNumber: 6, totalPoints: 4 },
    ];
    expect(formPoints(lastStats)).toBe(14);
    expect(formRecentPoints(lastStats)).toEqual([8, 4, 2]);
  });

  it("formPoints_accepts_weekPoints_alias", () => {
    expect(formPoints([{ weekNumber: 5, weekPoints: 11 }])).toBe(11);
  });

  it("formDisplayPoints_keeps_newest_three_scores", () => {
    expect(formDisplayPoints([8, 4, 2, 1, 0])).toEqual([8, 4, 2]);
  });

  it("formRecentWindow_slides_to_older_matchweeks", () => {
    const recent = [8, 4, 2, 1, 0];
    const weeks = [7, 6, 5, 4, 3];
    expect(formRecentWindow(recent, weeks, 0).points).toEqual([8, 4, 2]);
    expect(formRecentWindow(recent, weeks, 1).points).toEqual([4, 2, 1]);
    expect(formRecentWindow(recent, weeks, 0).canGoNewer).toBe(false);
    expect(formRecentWindow(recent, weeks, 2).canGoOlder).toBe(false);
  });

  it("formRecentWindow_start_beyond_history_reports_clamped_offset", () => {
    const view = formRecentWindow([8, 4, 2, 1, 0], [7, 6, 5, 4, 3], 9);

    expect(view.offset).toBe(2);
    expect(view.canGoOlder).toBe(false);
  });

  it("formWindowChronological_orders_oldest_matchweek_left", () => {
    const view = formWindowChronological(formRecentWindow([8, 4, 2], [7, 6, 5], 0));
    expect(view.weeks).toEqual([5, 6, 7]);
    expect(view.points).toEqual([2, 4, 8]);
  });

  it("formRecentWindow_slides_through_full_season_history", () => {
    const recent = [7, 6, 5, 4, 3, 2, 1];
    const weeks = [7, 6, 5, 4, 3, 2, 1];
    expect(formRecentWindow(recent, weeks, 0).weeks).toEqual([7, 6, 5]);
    expect(formRecentWindow(recent, weeks, 4).weeks).toEqual([3, 2, 1]);
    expect(formRecentWindow(recent, weeks, 0).canGoOlder).toBe(true);
  });

  it("formRecentPoints_includes_all_played_matchweeks_from_lastStats", () => {
    const lastStats = Array.from({ length: 7 }, (_, index) => ({
      weekNumber: index + 1,
      totalPoints: index + 1,
    }));
    expect(formRecentPoints(lastStats)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(formPoints(lastStats)).toBe(7 + 6 + 5 + 4 + 3);
  });

  it("formRecentWeekNumbers_aligns_with_newest_three_matchweeks", () => {
    const lastStats = [
      { weekNumber: 3, totalPoints: 2 },
      { weekNumber: 7, totalPoints: 8 },
      { weekNumber: 6, totalPoints: 4 },
    ];
    expect(formRecentWeekNumbers(lastStats)).toEqual([7, 6, 3]);
  });

  it("recentFormWeekNumbers_lists_played_matchweeks_newest_first", () => {
    expect(recentFormWeekNumbers(3)).toEqual([3, 2, 1]);
    expect(recentFormWeekNumbers(8, 5)).toEqual([8, 7, 6, 5, 4]);
    expect(recentFormWeekNumbers(4)).toEqual([4, 3, 2, 1]);
  });

  it("formFromCalendarWeeks_fills_missing_weeks_with_zero", () => {
    const statsByWeek = new Map<number, Map<string, number>>([
      [7, new Map([["42", 6]])],
      [6, new Map([["42", 0]])],
    ]);
    const result = formFromCalendarWeeks("42", [7, 6, 5], statsByWeek);
    expect(result.formRecent).toEqual([6, 0, 0]);
    expect(result.form).toBe(6);
  });

  it("formRecentPoints_excludes_open_matchweek_from_lastStats", () => {
    const lastStats = [
      { weekNumber: 8, totalPoints: 0 },
      { weekNumber: 7, totalPoints: 5 },
      { weekNumber: 6, totalPoints: 4 },
    ];
    expect(formRecentPoints(lastStats, 7)).toEqual([5, 4]);
    expect(formRecentWeekNumbers(lastStats, 7)).toEqual([7, 6]);
  });

  it("marketRow_uses_calendar_form_when_lastStats_missing", () => {
    const statsByWeek = new Map<number, Map<string, number>>([
      [7, new Map([["9", 3]])],
      [6, new Map([["9", 5]])],
    ]);
    const row = marketRow(
      { id: "m1", playerMaster: { id: "9", nickname: "A", positionId: 4 } },
      0,
      {
        catalog: new Map(),
        history: new Map(),
        calendarForm: { weekNumbers: [7, 6], statsByWeek, playedThrough: 7 },
      },
    );
    expect(row.form).toBe(8);
    expect(row.formRecent).toEqual([3, 5]);
    expect(row.formRecentWeeks).toEqual([7, 6]);
  });

  it("marketRow_keeps_coach_name_without_suffix", () => {
    const row = marketRow(
      { id: "m1", playerMaster: { id: "2877", nickname: "Luís Castro", positionId: 5 } },
      0,
      { catalog: new Map(), history: new Map() },
    );
    expect(row.name).toBe("Luís Castro");
  });

  it("marketRow_fills_team_name_from_teams_master", () => {
    const row = marketRow(
      {
        id: "m1",
        playerMaster: { id: "1", nickname: "P", teamId: "2" },
      },
      0,
      { catalog: new Map(), history: new Map() },
    );
    expect(row.teamName).toBe("Atlético de Madrid");
  });

  it("marketRow_maps_seller_team_and_clause_fields", () => {
    const row = marketRow(
      {
        id: "mk-1",
        playerMaster: { id: "1", nickname: "P", marketValue: 100 },
        sellerTeam: { id: "team-9", manager: { managerName: "Rival" } },
        playerTeam: {
          playerTeamId: "pt-1",
          buyoutClause: 500_000,
          buyoutClauseLockedEndTime: "2020-01-01T00:00:00Z",
          isShielded: false,
        },
        bid: { id: "bid-1", money: 120 },
      },
      0,
      { catalog: new Map(), history: new Map(), callerTeamId: "team-me" },
    );
    expect(row.sellerTeamId).toBe("team-9");
    expect(row.playerTeamId).toBe("pt-1");
    expect(row.buyoutClause).toBe(500_000);
    expect(row.myBid).toEqual({ id: "bid-1", money: 120 });
    expect(row.sellerKind).toBe("opponent");
  });

  it("marketRow_prefers_listing_bid_id_over_userBids_envelope", () => {
    const userBids = new Map([
      ["mk-1", { id: "bid-envelope", money: 999 }],
    ]);
    const row = marketRow(
      {
        id: "mk-1",
        playerMaster: { id: "1", nickname: "P" },
        bid: { id: "bid-real", money: 120 },
      },
      0,
      { catalog: new Map(), history: new Map(), userBidsByMarketId: userBids },
    );
    expect(row.myBid).toEqual({ id: "bid-real", money: 120 });
  });
});
