import { describe, expect, it } from "vitest";
import { routeSectionKey } from "./App";

describe("routeSectionKey", () => {
  it("teamsList_andClubPage_shareKeySoSwitchingClubsDoesNotReplayFade", () => {
    expect(routeSectionKey("/teams")).toBe(routeSectionKey("/teams/12"));
  });

  it("players_listAndDetail_differ", () => {
    expect(routeSectionKey("/players")).toBe("players");
    expect(routeSectionKey("/players/5")).toBe("players-detail");
    expect(routeSectionKey("/players/6")).toBe("players-detail");
  });

  it("root_isEmptyKey", () => {
    expect(routeSectionKey("/")).toBe("");
  });
});
