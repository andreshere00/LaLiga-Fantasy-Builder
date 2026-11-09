import { describe, expect, it } from "vitest";
import { hierarchyGroups, visibleGroups, type HierarchyEntry } from "./teamHierarchy";

// ---- Mocks, fixtures & helpers ---- //

function entry(over: Partial<HierarchyEntry> & { name: string }): HierarchyEntry {
  return { playerId: over.name, positionId: 3, points: null, hierarchy: null, rank: null, ...over };
}

describe("hierarchyGroups", () => {
  // ---- Happy path ---- //

  it("hierarchyGroups_mixed_roles_orders_levels_from_most_to_least_important", () => {
    const groups = hierarchyGroups([
      entry({ name: "A", hierarchy: "Reserva" }),
      entry({ name: "B", hierarchy: "Importante" }),
      entry({ name: "C", hierarchy: "Dios" }),
      entry({ name: "D", hierarchy: "Rotación" }),
      entry({ name: "E", hierarchy: "Clave" }),
    ]);
    expect(groups.map((group) => group.label)).toEqual([
      "God", "Key player", "Important", "Rotation", "Reserve",
    ]);
  });

  it("hierarchyGroups_same_level_in_two_languages_joins_one_group", () => {
    const groups = hierarchyGroups([
      entry({ name: "A", hierarchy: "Clave" }),
      entry({ name: "B", hierarchy: "key" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.players).toHaveLength(2);
  });

  it("hierarchyGroups_within_a_level_puts_top_scorers_first_then_names", () => {
    const [group] = hierarchyGroups([
      entry({ name: "Zed", hierarchy: "Clave", points: 5 }),
      entry({ name: "Ana", hierarchy: "Clave", points: 5 }),
      entry({ name: "Bo", hierarchy: "Clave", points: 20 }),
      entry({ name: "Cy", hierarchy: "Clave", points: null }),
    ]);
    expect(group?.players.map((player) => player.name)).toEqual(["Bo", "Ana", "Zed", "Cy"]);
  });

  // ---- Edge cases ---- //

  it("hierarchyGroups_missing_or_unknown_roles_come_last", () => {
    const groups = hierarchyGroups([
      entry({ name: "A" }),
      entry({ name: "B", hierarchy: "Misterioso" }),
      entry({ name: "C", hierarchy: "Reserva" }),
    ]);
    expect(groups.map((group) => group.label)).toEqual(["Reserve", "Unknown", "Unavailable"]);
  });

  it("hierarchyGroups_no_players_returns_no_groups", () => {
    expect(hierarchyGroups([])).toEqual([]);
  });
});

describe("visibleGroups", () => {
  const groups = () => hierarchyGroups([
    entry({ name: "A", hierarchy: "Clave" }),
    entry({ name: "B", hierarchy: "Clave", idle: true }),
    entry({ name: "C", hierarchy: "Reserva", idle: true }),
  ]);

  it("visibleGroups_idle_hidden_drops_those_players_and_levels_left_empty", () => {
    const shown = visibleGroups(groups(), false);
    expect(shown.map((group) => group.label)).toEqual(["Key player"]);
    expect(shown[0]?.players.map((player) => player.name)).toEqual(["A"]);
  });

  it("visibleGroups_idle_shown_keeps_everyone", () => {
    const shown = visibleGroups(groups(), true);
    expect(shown.map((group) => group.players.length)).toEqual([2, 1]);
  });
});
