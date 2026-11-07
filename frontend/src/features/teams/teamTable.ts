export type SquadRow = {
  playerId: string;
  name: string;
  positionId: number | null;
  points: number | null;
  stats: Record<string, number | null | undefined>;
};

export const SQUAD_COLUMNS = [
  "minutes",
  "goals",
  "assists",
  "dribbles",
  "penaltiesCommitted",
  "penaltiesSaved",
  "shots",
  "recoveries",
  "saves",
  "ballsLost",
  "yellowCards",
  "redCards",
] as const;

export type SquadColumn = (typeof SQUAD_COLUMNS)[number] | "points";

const POSITION_ORDER: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3 };

export function sortSquad(
  rows: readonly SquadRow[],
  column: SquadColumn | "position",
  direction: "asc" | "desc",
): SquadRow[] {
  const copy = [...rows];
  copy.sort((left, right) => {
    const delta = valueOf(left, column) - valueOf(right, column);
    if (delta !== 0) return direction === "asc" ? delta : -delta;
    return left.name.localeCompare(right.name);
  });
  return copy;
}

function valueOf(row: SquadRow, column: SquadColumn | "position"): number {
  if (column === "position") return POSITION_ORDER[row.positionId ?? -1] ?? 99;
  if (column === "points") return row.points ?? Number.NEGATIVE_INFINITY;
  const stat = row.stats[column];
  return typeof stat === "number" ? stat : Number.NEGATIVE_INFINITY;
}
