import { describe, expect, it } from "vitest";
import { parsePlayersSearchParams, playersFilterPath } from "./playersSearchParams";

describe("playersFilterPath", () => {
  it("playersFilterPath_position_and_club_round_trip_through_the_parser", () => {
    const path = playersFilterPath({ positionId: 3, team: "FC Barcelona" });
    const state = parsePlayersSearchParams(new URL(path, "http://x").searchParams);
    expect([...state.filters.positions]).toEqual([3]);
    expect(state.filters.team).toBe("FC Barcelona");
  });

  it("playersFilterPath_without_filters_returns_the_plain_list", () => {
    expect(playersFilterPath({})).toBe("/players");
  });
});
