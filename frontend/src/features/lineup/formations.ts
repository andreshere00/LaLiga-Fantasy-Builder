/** Fallback when the lineup API does not include available formations. */
export const DEFAULT_LINEUPS_AVAILABLE = {
  free: ["5,4,1", "5,3,2", "4,5,1", "4,4,2", "4,3,3", "3,5,2", "3,4,3"],
  premium: ["5,2,3", "4,6,0", "4,2,4", "3,6,1", "3,3,4"],
} as const;

export const DEFAULT_FREE_FORMATION_CODES: readonly string[] =
  DEFAULT_LINEUPS_AVAILABLE.free;

export function tacticalFromCode(code: string): number[] {
  return code.split(",").map((part) => Number(part));
}

export function codeFromTactical(tactical: readonly number[] | null | undefined): string | null {
  if (!tactical || tactical.length !== 3) return null;
  if (!tactical.every((value) => Number.isFinite(value))) return null;
  return tactical.join(",");
}

export function formationSelectOptions(
  codes: readonly string[] = DEFAULT_FREE_FORMATION_CODES,
): { value: string; label: string }[] {
  return codes.map((code) => ({
    value: code,
    label: code.split(",").join("-"),
  }));
}

export function allFormationCounts(
  source: { free: readonly string[]; premium: readonly string[] } = DEFAULT_LINEUPS_AVAILABLE,
): number[][] {
  return [...source.free, ...source.premium].map((formation) =>
    formation.split(",").map((part) => Number(part)),
  );
}
