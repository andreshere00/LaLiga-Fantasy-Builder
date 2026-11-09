import type { PredictedPlayer } from "./teamLineup";

export const PITCH_LINES = ["delantero", "mediocampista", "defensa", "portero"] as const;

export type PitchLine = (typeof PITCH_LINES)[number] | "other";

const LINE_LABELS: Record<PitchLine, string> = {
  delantero: "Attack",
  mediocampista: "Midfield",
  defensa: "Defense",
  portero: "Goalkeeper",
  other: "Unplaced",
};

export function pitchLine(position: string | null): PitchLine {
  const value = (position ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (value.includes("porter") || value.includes("goalkeeper")) return "portero";
  if (value.includes("defens")) return "defensa";
  if (value.includes("medio") || value.includes("midfield")) return "mediocampista";
  if (value.includes("delan") || value.includes("forward") || value.includes("striker") || value.includes("attack")) {
    return "delantero";
  }
  return "other";
}

export function pitchLineLabel(line: PitchLine): string {
  return LINE_LABELS[line];
}

/** Attack at the top, goalkeeper at the bottom. Page order is kept inside a line. */
export function pitchLines<T extends Pick<PredictedPlayer, "position">>(
  players: readonly T[],
): { line: PitchLine; players: T[] }[] {
  const grouped = new Map<PitchLine, T[]>();
  for (const player of players) {
    const line = pitchLine(player.position);
    const current = grouped.get(line) ?? [];
    current.push(player);
    grouped.set(line, current);
  }
  const order: PitchLine[] = ["delantero", "other", "mediocampista", "defensa", "portero"];
  return order.flatMap((line) => {
    const row = grouped.get(line);
    return row && row.length > 0 ? [{ line, players: row }] : [];
  });
}
