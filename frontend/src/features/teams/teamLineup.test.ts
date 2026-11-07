import { describe, expect, it } from "vitest";
import {
  alternativesBySlot,
  fieldPlayerPath,
  matchCatalogPlayer,
  orderedAlternatives,
} from "./teamLineup";

const alternatives = [
  { name: "Diatta", probability: 0, position: "Forward" },
  { name: "Later", probability: 40, position: "Forward" },
  { name: "Keeper", probability: 12, position: "Goalkeeper" },
];

describe("predicted lineup", () => {
  it("orderedAlternatives_keeps_a_published_zero", () => {
    expect(orderedAlternatives(alternatives).map((player) => player.name)).toEqual([
      "Later", "Keeper", "Diatta",
    ]);
  });

  it("alternativesBySlot_keeps_players_on_their_slot", () => {
    const groups = alternativesBySlot(orderedAlternatives(alternatives));
    expect(groups.map((group) => group.position)).toEqual(["Forward", "Goalkeeper"]);
    expect(groups[0]?.players.map((player) => player.name)).toEqual(["Later", "Diatta"]);
  });

  it("matchCatalogPlayer_unique_name_resolves_and_a_tie_does_not", () => {
    const catalog = [
      { playerId: "7", name: "Isco", nickname: "Isco" },
      { playerId: "8", name: "Alex Valles", nickname: "Á. Valles" },
      { playerId: "9", name: "Alex Valles", nickname: "A. Valles" },
    ];
    expect(matchCatalogPlayer("Isco", catalog)).toBe("7");
    expect(matchCatalogPlayer("Á. Valles", catalog)).toBeNull();
  });

  it("fieldPlayerPath_focuses_the_squad_card", () => {
    expect(fieldPlayerPath("7", "t1")).toBe("/?focusPlayer=7&team=t1");
    expect(fieldPlayerPath("7", null)).toBe("/?focusPlayer=7");
  });
});
