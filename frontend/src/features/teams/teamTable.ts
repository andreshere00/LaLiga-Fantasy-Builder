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

/** Stat columns that have at least one published number. A blank is not a zero. */
export function publishedColumns(
  rows: readonly SquadRow[],
  totals: Record<string, unknown>,
): SquadColumn[] {
  return SQUAD_COLUMNS.filter((column) => (
    typeof totals[column] === "number"
    || rows.some((row) => typeof row.stats[column] === "number")
  ));
}

/**
 * Splits the squad into players who have been on the pitch and players with a published zero
 * minutes, who add noise to the table. A blank is not a zero, so a player whose minutes are not
 * published stays with the others. When nobody has played there is nothing to fold away.
 */
export function splitByMinutes(rows: readonly SquadRow[]): { played: SquadRow[]; idle: SquadRow[] } {
  const idle = rows.filter((row) => row.stats.minutes === 0);
  if (idle.length === rows.length) return { played: [...rows], idle: [] };
  return { played: rows.filter((row) => row.stats.minutes !== 0), idle };
}

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
