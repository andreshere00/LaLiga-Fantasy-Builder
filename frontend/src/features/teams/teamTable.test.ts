import { describe, expect, it } from "vitest";
import { publishedColumns, sortSquad, splitByMinutes, type SquadRow } from "./teamTable";

const rows: SquadRow[] = [
  { playerId: "2", name: "Zeta", positionId: 4, points: 5, stats: { goals: null } },
  { playerId: "1", name: "Ana", positionId: 2, points: 5, stats: { goals: 1 } },
  { playerId: "3", name: "Bea", positionId: 1, points: null, stats: {} },
];

describe("squad table", () => {
  it("sortSquad_default_position_orders_goalkeeper_before_defender", () => {
    expect(sortSquad(rows, "position", "asc").map((row) => row.name)).toEqual(["Bea", "Ana", "Zeta"]);
  });

  it("publishedColumns_hides_columns_with_no_number", () => {
    expect(publishedColumns(rows, { goals: null, minutes: 90 })).toEqual(["minutes", "goals"]);
  });

  it("splitByMinutes_separates_a_published_zero_from_a_blank", () => {
    const squad: SquadRow[] = [
      { playerId: "1", name: "Plays", positionId: 2, points: 3, stats: { minutes: 90 } },
      { playerId: "2", name: "Bench", positionId: 2, points: 0, stats: { minutes: 0 } },
      { playerId: "3", name: "Blank", positionId: 2, points: 0, stats: { minutes: null } },
    ];
    const { played, idle } = splitByMinutes(squad);
    expect(played.map((row) => row.name)).toEqual(["Plays", "Blank"]);
    expect(idle.map((row) => row.name)).toEqual(["Bench"]);
  });

  it("splitByMinutes_nobody_has_played_keeps_every_row_visible", () => {
    const squad: SquadRow[] = [
      { playerId: "1", name: "A", positionId: 2, points: 0, stats: { minutes: 0 } },
      { playerId: "2", name: "B", positionId: 2, points: 0, stats: { minutes: 0 } },
    ];
    expect(splitByMinutes(squad)).toEqual({ played: squad, idle: [] });
  });

  it("sortSquad_points_puts_missing_values_last", () => {
    expect(sortSquad(rows, "points", "desc").map((row) => row.name)).toEqual(["Ana", "Zeta", "Bea"]);
  });
});
