import type { Availability } from "../market/model/availability";

export type SquadNumericRange = { min: number | null; max: number | null };

export type SquadFilters = {
  positions: ReadonlySet<number>;
  points: SquadNumericRange;
  clubs: ReadonlySet<string>;
  minStarterProbability: number;
  forms: ReadonlySet<string>;
  availability: ReadonlySet<Availability>;
};

export type SquadFilterPlayer = {
  id: string;
  positionId: number | null;
  points: number | null;
  club: string | null;
  starterProbability: number | null;
  form: string | null;
  availability: Availability | null;
};

export const STARTER_PROBABILITY_STEP: number = 5;

export const SQUAD_FORM_OPTIONS = ["Very poor", "Poor", "Average", "Good", "Very good"] as const;

/** Returns filters that keep every squad player. */
export function createEmptySquadFilters(): SquadFilters {
  return {
    positions: new Set(),
    points: { min: null, max: null },
    clubs: new Set(),
    minStarterProbability: 0,
    forms: new Set(),
    availability: new Set(),
  };
}

/** Copies filter sets so a later edit does not change the applied filters. */
export function cloneSquadFilters(filters: SquadFilters): SquadFilters {
  return {
    positions: new Set(filters.positions),
    points: { ...filters.points },
    clubs: new Set(filters.clubs),
    minStarterProbability: filters.minStarterProbability,
    forms: new Set(filters.forms),
    availability: new Set(filters.availability),
  };
}

/** Counts selected filter groups. An empty selection does not count. */
export function activeSquadFilterCount(filters: SquadFilters): number {
  return [
    filters.positions.size > 0,
    rangeActive(filters.points),
    filters.clubs.size > 0,
    filters.minStarterProbability > 0,
    filters.forms.size > 0,
    filters.availability.size > 0,
  ].filter(Boolean).length;
}

/**
 * Keeps players that match every active condition.
 *
 * Args:
 *   players: Squad players with the values shown on their cards.
 *   filters: Applied squad filters.
 *   pending: When true, a value that is still loading is not excluded.
 *
 * Returns:
 *   Players that remain visible.
 */
export function applySquadFilters<T extends SquadFilterPlayer>(
  players: readonly T[],
  filters: SquadFilters,
  pending: boolean,
): T[] {
  return players.filter((player) =>
    matchesSet(player.positionId, filters.positions, pending)
    && matchesRange(player.points, filters.points, false)
    && matchesSet(player.club, filters.clubs, pending)
    && matchesRange(player.starterProbability, minimumRange(filters), pending)
    && matchesSet(player.form, filters.forms, pending)
    && matchesSet(player.availability, filters.availability, pending));
}

/** Club names present on the current squad, in display order. */
export function squadClubOptions(players: readonly SquadFilterPlayer[]): string[] {
  return [...new Set(players.flatMap((player) => player.club ? [player.club] : []))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

/** Lowest and highest season points in the squad, or null when none is known. */
export function squadPointsBounds(
  players: readonly SquadFilterPlayer[],
): SquadNumericRange | null {
  const points = players.flatMap((player) => player.points == null ? [] : [player.points]);
  return points.length === 0 ? null : { min: Math.min(...points), max: Math.max(...points) };
}

function minimumRange(filters: SquadFilters): SquadNumericRange {
  return { min: filters.minStarterProbability || null, max: null };
}

function rangeActive(range: SquadNumericRange): boolean {
  return range.min != null || range.max != null;
}

function matchesRange(value: number | null, range: SquadNumericRange, pending: boolean): boolean {
  if (!rangeActive(range)) return true;
  if (value == null) return pending;
  if (range.min != null && value < range.min) return false;
  if (range.max != null && value > range.max) return false;
  return true;
}

function matchesSet<T>(value: T | null, selected: ReadonlySet<T>, pending: boolean): boolean {
  if (selected.size === 0) return true;
  if (value == null) return pending;
  return selected.has(value);
}

export type SquadFilterKey =
  | "positions" | "points" | "clubs" | "minStarterProbability" | "forms" | "availability";

/** Returns a copy with one filter group reset to "any". */
export function clearSquadFilter(filters: SquadFilters, key: SquadFilterKey): SquadFilters {
  return { ...cloneSquadFilters(filters), [key]: createEmptySquadFilters()[key] };
}
