import type { LineupRole } from "../../api/mappers";

/** Max outfield players in one horizontal row on the pitch. */
export const MAX_PLAYERS_PER_LINE = 6;

/** Horizontal gap between player tiles as a fraction of pitch width (1/40). */
export function pitchRowGapFraction(_count: number): number {
  return 1 / 40;
}

export function pitchRows<T>(players: readonly T[], role: LineupRole): T[][] {
  if (players.length === 0) return [];
  const limit = role === "goalkeeper" ? 1 : MAX_PLAYERS_PER_LINE;
  const line = players.slice(0, limit);
  return [line];
}
