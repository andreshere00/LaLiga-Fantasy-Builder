import { describe, expect, it } from "vitest";
import {
  alternativesBySlot,
  fieldPlayerPath,
  matchCatalogPlayer,
  matchRosterPlayer,
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
    expect(matchCatalogPlayer("Player 01", [
      { playerId: "1", name: "Player 01", nickname: "Player 01" },
    ])).toBe("1");
    expect(matchCatalogPlayer("Á. Valles", catalog)).toBeNull();
  });

  it("fieldPlayerPath_focuses_the_squad_card", () => {
    expect(fieldPlayerPath("7", "t1")).toBe("/?focusPlayer=7&team=t1");
    expect(fieldPlayerPath("7", null)).toBe("/?focusPlayer=7");
  });
});

describe("matchRosterPlayer", () => {
  const squad = [
    { playerId: "1", name: "Iñaki Williams" },
    { playerId: "2", name: "Nico Williams" },
    { playerId: "3", name: "O. Sancet" },
    { playerId: "4", name: "De Galarreta" },
    { playerId: "5", name: "Peio Canales" },
  ];
  it("matchRosterPlayer_initial_and_surname_resolve_the_squad_member", () => {
    expect(matchRosterPlayer("I. Williams", squad)?.playerId).toBe("1");
    expect(matchRosterPlayer("N. Williams", squad)?.playerId).toBe("2");
    expect(matchRosterPlayer("R. de Galarreta", squad)?.playerId).toBe("4");
    expect(matchRosterPlayer("Sancet", squad)?.playerId).toBe("3");
    expect(matchRosterPlayer("Canales", squad)?.playerId).toBe("5");
  });
  it("matchRosterPlayer_ambiguous_or_unknown_names_stay_unmatched", () => {
    expect(matchRosterPlayer("Williams", squad)).toBeNull();
    expect(matchRosterPlayer("Nobody", squad)).toBeNull();
    expect(matchRosterPlayer("", squad)).toBeNull();
  });
});
