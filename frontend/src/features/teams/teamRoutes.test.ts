import { describe, expect, it } from "vitest";
import { clubTeamPath, initialClubId, teamPath, teamSearch } from "./teamRoutes";
import { teamsClubId } from "../../api/clubMedia";

const clubs = [
  { clubId: 20, name: "Villarreal CF" },
  { clubId: 4, name: "FC Barcelona" },
  { clubId: 9, name: "Getafe CF" },
];

describe("team routes", () => {
  it("teamSearch_missing_params_uses_performance_laliga_and_five", () => {
    expect(teamSearch(new URLSearchParams())).toEqual({
      section: "performance",
      competition: "laliga",
      window: "5",
    });
  });

  it("teamPath_keeps_section_competition_and_window", () => {
    expect(teamPath(20, { section: "news", competition: "european", window: "10" }))
      .toBe("/teams/20?section=news&competition=european&window=10");
  });

  it("teamPath_default_section_is_omitted_and_players_is_kept", () => {
    expect(teamPath(20, { section: "performance", competition: "laliga", window: "5" })).toBe("/teams/20");
    expect(teamPath(20, { section: "players", competition: "laliga", window: "5" }))
      .toBe("/teams/20?section=players");
  });

  it("initialClubId_known_opponent_opens_that_club", () => {
    expect(initialClubId(clubs, "es", { opponentClubId: 20 })).toBe(20);
  });

  it("initialClubId_unknown_opponent_opens_first_club_in_the_locale", () => {
    expect(initialClubId(clubs, "es")).toBe(4);
  });

  it("clubTeamPath_hierarchy_opens_players_section_with_anchor", () => {
    expect(clubTeamPath(4)).toBe("/teams/4");
    expect(clubTeamPath(4, "hierarchy")).toBe("/teams/4?section=players#team-hierarchy");
  });

  it("teamsClubId_resolves_team_id_dsp_id_and_crest", () => {
    expect(teamsClubId("4")).toBe("4");
    expect(teamsClubId(74)).toBe("4");
    expect(teamsClubId(null,
      "https://assets-fantasy.llt-services.com/teambadge/t174/color/t174_athletic-club.png")).toBe("3");
    expect(teamsClubId(null, "https://example.com/unknown.png")).toBeNull();
  });
});
