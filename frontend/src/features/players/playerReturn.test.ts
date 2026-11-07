import { describe, expect, it } from "vitest";
import { detailReturnTo, returnPlace } from "./playerReturn";

describe("detailReturnTo", () => {
  it("detailReturnTo_club_path_returns_to_that_club", () => {
    const path = "/teams/20?section=lineup";
    expect(detailReturnTo(path)).toBe(path);
    expect(returnPlace(path)).toBe("Teams");
  });

  it("detailReturnTo_unknown_path_stays_on_players", () => {
    expect(detailReturnTo("/account")).toBe("/players");
    expect(detailReturnTo(null)).toBe("/players");
  });
});
