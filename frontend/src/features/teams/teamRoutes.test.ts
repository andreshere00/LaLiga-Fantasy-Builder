import { describe, expect, it } from "vitest";
import { initialClubId, teamPath, teamSearch } from "./teamRoutes";

const clubs = [
  { clubId: 20, name: "Villarreal CF" },
  { clubId: 4, name: "FC Barcelona" },
  { clubId: 9, name: "Getafe CF" },
];

describe("team routes", () => {
  it("teamSearch_missing_params_uses_players_laliga_and_five", () => {
    expect(teamSearch(new URLSearchParams())).toEqual({
      section: "players",
      competition: "laliga",
      window: "5",
    });
  });

  it("teamPath_keeps_section_competition_and_window", () => {
    expect(teamPath(20, { section: "news", competition: "european", window: "10" }))
      .toBe("/teams/20?section=news&competition=european&window=10");
  });

  it("initialClubId_known_opponent_opens_that_club", () => {
    expect(initialClubId(clubs, "es", { opponentClubId: 20 })).toBe(20);
  });

  it("initialClubId_unknown_opponent_opens_first_club_in_the_locale", () => {
    expect(initialClubId(clubs, "es")).toBe(4);
  });
});
