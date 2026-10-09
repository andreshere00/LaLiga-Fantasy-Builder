import { describe, expect, it } from "vitest";

import { favoriteMarketRowClass } from "./favorites";

// ---- Happy path ---- #

describe("favoriteMarketRowClass", () => {
  it("favoriteMarketRowClass_favoritedPlayer_returnsIsFavorite", () => {
    expect(favoriteMarketRowClass("12", new Set(["12"]))).toBe("is-favorite");
  });

  it("favoriteMarketRowClass_notFavorited_returnsUndefined", () => {
    expect(favoriteMarketRowClass("12", new Set())).toBeUndefined();
  });
});

// ---- Edge cases ---- #

describe("favoriteMarketRowClass_missingId", () => {
  it("favoriteMarketRowClass_nullPlayerId_returnsUndefined", () => {
    expect(favoriteMarketRowClass(null, new Set(["12"]))).toBeUndefined();
  });
});
