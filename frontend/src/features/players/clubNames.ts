/** Short club codes from `venues.json` aliases, shown as the non-code name. */
const CLUB_CODE_NAMES: Record<string, string> = {
  BAR: "Barcelona",
  RMA: "Real Madrid",
  MAD: "Real Madrid",
  ATM: "Atlético",
  ATH: "Athletic",
  BET: "Betis",
  CEL: "Celta",
  ESP: "Espanyol",
  GET: "Getafe",
  GIR: "Girona",
  LPA: "Palmas",
  LEG: "Leganés",
  MLL: "Mallorca",
  OSA: "Osasuna",
  RAY: "Rayo",
  RSO: "Sociedad",
  SEV: "Sevilla",
  VAL: "Valencia",
  VIL: "Villarreal",
  ALA: "Alavés",
  VLL: "Valladolid",
  LEV: "Levante",
  RAC: "Racing",
  PSG: "PSG",
};

/** Expands a 2–4 letter club code. Full names are returned unchanged. */
export function clubDisplayName(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[A-Z]{2,4}$/.test(trimmed)) return CLUB_CODE_NAMES[trimmed] ?? trimmed;
  return trimmed;
}
