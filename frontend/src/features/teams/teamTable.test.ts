import { describe, expect, it } from "vitest";
import { sortSquad, type SquadRow } from "./teamTable";

const rows: SquadRow[] = [
  { playerId: "2", name: "Zeta", positionId: 4, points: 5, stats: { goals: null } },
  { playerId: "1", name: "Ana", positionId: 2, points: 5, stats: { goals: 1 } },
  { playerId: "3", name: "Bea", positionId: 1, points: null, stats: {} },
];

describe("squad table", () => {
  it("sortSquad_default_position_orders_goalkeeper_before_defender", () => {
    expect(sortSquad(rows, "position", "asc").map((row) => row.name)).toEqual(["Bea", "Ana", "Zeta"]);
  });

  it("sortSquad_points_puts_missing_values_last", () => {
    expect(sortSquad(rows, "points", "desc").map((row) => row.name)).toEqual(["Ana", "Zeta", "Bea"]);
  });
});
