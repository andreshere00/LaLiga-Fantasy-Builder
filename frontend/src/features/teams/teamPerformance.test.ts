import { describe, expect, it } from "vitest";
import {
  competitionName, matchWindow, nextMatchId, scoreText, summarize, type ClubMatchView,
} from "./teamPerformance";

function match(partial: Partial<ClubMatchView> & Pick<ClubMatchView, "matchId">): ClubMatchView {
  return {
    group: "laliga",
    competition: "laliga",
    home: "20",
    away: "9",
    homeBadge: null,
    awayBadge: null,
    kickoff: "2026-09-01T18:00:00Z",
    kickoffText: null,
    roundLabel: null,
    regulationHome: 1,
    regulationAway: 0,
    finalHome: null,
    finalAway: null,
    outcome: "win",
    venue: "home",
    scheduled: false,
    ...partial,
  };
}

const season = [
  match({
    matchId: "1", kickoff: "2026-08-01T18:00:00Z", venue: "home", outcome: "win",
    regulationHome: 2, regulationAway: 0,
  }),
  match({
    matchId: "2", kickoff: "2026-08-08T18:00:00Z", venue: "away", outcome: "draw",
    regulationHome: 1, regulationAway: 1,
  }),
  match({
    matchId: "3", kickoff: "2026-08-15T18:00:00Z", venue: "home", outcome: "loss",
    regulationHome: 0, regulationAway: 1,
  }),
  match({
    matchId: "4", kickoff: "2026-08-22T18:00:00Z", venue: "away", outcome: "win",
    regulationHome: 0, regulationAway: 2,
  }),
  match({
    matchId: "5", kickoff: "2026-08-29T18:00:00Z", venue: "home", outcome: "win",
    regulationHome: 3, regulationAway: 1,
  }),
  match({
    matchId: "6", kickoff: "2026-09-05T18:00:00Z", venue: "home", outcome: "draw",
    regulationHome: 0, regulationAway: 0,
  }),
  match({
    matchId: "next", kickoff: "2026-11-08T18:00:00Z", scheduled: true, outcome: null,
    regulationHome: null, regulationAway: null,
  }),
  match({
    matchId: "cup",
    group: "european",
    competition: "champions_league",
    kickoff: "2026-10-01T18:00:00Z",
    home: "Liverpool",
    away: "Villarreal",
    venue: "away",
    outcome: "loss",
    regulationHome: 2,
    regulationAway: 2,
    finalHome: 4,
    finalAway: 5,
  }),
];

describe("club results", () => {
  it("matchWindow_default_laliga_keeps_five_previous_and_the_next_match", () => {
    const view = matchWindow(season, "laliga", "5");
    expect(view.previous.map((item) => item.matchId)).toEqual(["6", "5", "4", "3", "2"]);
    expect(view.upcoming.map((item) => item.matchId)).toEqual(["next"]);
  });

  it("matchWindow_season_includes_every_laliga_result", () => {
    const view = matchWindow(season, "laliga", "season");
    expect(view.previous).toHaveLength(6);
  });

  it("scoreText_parenthetical_score_keeps_both_published_scores", () => {
    expect(scoreText(season.find((item) => item.matchId === "cup")!)).toBe("2 (4) – 2 (5)");
  });

  it("summarize_home_and_away_totals_follow_the_visible_window", () => {
    const view = matchWindow(season, "laliga", "5");
    const summary = summarize(view.previous);
    expect(summary.home.won).toBe(1);
    expect(summary.away.won).toBe(1);
    expect(summary.away.drawn).toBe(1);
    expect(summary.won + summary.drawn + summary.lost).toBe(5);
  });

  it("matchWindow_empty_domestic_filter_has_no_rows", () => {
    expect(matchWindow(season, "domestic", "5").filtered).toHaveLength(0);
  });
});

describe("competitionName", () => {
  it("competitionName_provider_ids_read_as_names", () => {
    expect(competitionName("laliga")).toBe("LaLiga");
    expect(competitionName("champions_league")).toBe("Champions League");
    expect(competitionName("Copa del Rey")).toBe("Copa Del Rey");
  });
});

describe("nextMatchId", () => {
  const stale = match({ matchId: "stale", scheduled: true, kickoff: "2026-10-25T18:30:00Z" });
  const upcoming = match({ matchId: "soon", scheduled: true, kickoff: "2026-11-22T21:00:00Z" });

  it("nextMatchId_listed_api_pick_wins_over_an_earlier_stale_fixture", () => {
    expect(nextMatchId([stale, upcoming], "soon")).toBe("soon");
  });

  const now = Date.parse("2026-11-09T12:00:00Z");

  it("nextMatchId_api_pick_outside_the_filtered_list_skips_a_stale_fixture", () => {
    expect(nextMatchId([stale, upcoming], "elsewhere", now)).toBe("soon");
  });

  it("nextMatchId_without_an_api_pick_uses_the_first_match_still_ahead", () => {
    expect(nextMatchId([stale, upcoming], null, now)).toBe("soon");
    expect(nextMatchId([upcoming], null, now)).toBe("soon");
  });

  it("nextMatchId_without_any_match_ahead_is_null", () => {
    expect(nextMatchId([stale], null, now)).toBeNull();
    expect(nextMatchId([], "soon", now)).toBeNull();
  });
});
