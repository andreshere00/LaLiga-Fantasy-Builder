export const COACH_POSITION_ID = 5;

const POSITIONS: Record<number, { abbrev: string; label: string; tone: string }> = {
  1: { abbrev: "GKP", label: "Goalkeeper", tone: "gk" },
  2: { abbrev: "DEF", label: "Defense", tone: "def" },
  3: { abbrev: "MDF", label: "Midfielder", tone: "mdf" },
  4: { abbrev: "ATK", label: "Attacker", tone: "fwd" },
  5: { abbrev: "COA", label: "Coach", tone: "coa" },
};

export function positionAbbrev(positionId: number | null): string {
  if (positionId == null) return "—";
  return POSITIONS[positionId]?.abbrev ?? "—";
}

export function positionLabel(positionId: number | null): string | null {
  if (positionId == null) return null;
  return POSITIONS[positionId]?.label ?? null;
}

export function positionTone(positionId: number | null): string {
  if (positionId == null) return "unknown";
  return POSITIONS[positionId]?.tone ?? "unknown";
}

export function isCoachPosition(positionId: number | null): boolean {
  return positionId === COACH_POSITION_ID;
}
