export const COACH_POSITION_ID = 5;

const POSITIONS: Record<number, { abbrev: string; tone: string }> = {
  1: { abbrev: "GKP", tone: "gk" },
  2: { abbrev: "DEF", tone: "def" },
  3: { abbrev: "MDF", tone: "mdf" },
  4: { abbrev: "FWD", tone: "fwd" },
  5: { abbrev: "COA", tone: "coa" },
};

export function positionAbbrev(positionId: number | null): string {
  if (positionId == null) return "—";
  return POSITIONS[positionId]?.abbrev ?? "—";
}

export function positionTone(positionId: number | null): string {
  if (positionId == null) return "unknown";
  return POSITIONS[positionId]?.tone ?? "unknown";
}

export function isCoachPosition(positionId: number | null): boolean {
  return positionId === COACH_POSITION_ID;
}
