import type { Availability } from "../market/model/availability";

export type SquadNumericRange = { min: number | null; max: number | null };

export type SquadFilters = {
  positions: ReadonlySet<number>;
  points: SquadNumericRange;
  clubs: ReadonlySet<string>;
  starterProbability: SquadNumericRange;
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

export const SQUAD_FORM_OPTIONS = ["Very poor", "Poor", "Average", "Good", "Very good"] as const;

/** Returns filters that keep every squad player. */
export function createEmptySquadFilters(): SquadFilters {
  return {
    positions: new Set(),
    points: { min: null, max: null },
    clubs: new Set(),
    starterProbability: { min: null, max: null },
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
    starterProbability: { ...filters.starterProbability },
    forms: new Set(filters.forms),
    availability: new Set(filters.availability),
  };
}

/** True when minimum and maximum are both set and minimum is greater. */
export function squadRangeInvalid(range: SquadNumericRange): boolean {
  return range.min != null && range.max != null && range.min > range.max;
}

/** Counts selected filter groups. An empty selection does not count. */
export function activeSquadFilterCount(filters: SquadFilters): number {
  return [
    filters.positions.size > 0,
    rangeActive(filters.points),
    filters.clubs.size > 0,
    rangeActive(filters.starterProbability),
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
    && matchesRange(player.starterProbability, filters.starterProbability, pending)
    && matchesSet(player.form, filters.forms, pending)
    && matchesSet(player.availability, filters.availability, pending));
}

/** Club names present on the current squad, in display order. */
export function squadClubOptions(players: readonly SquadFilterPlayer[]): string[] {
  return [...new Set(players.flatMap((player) => player.club ? [player.club] : []))]
    .sort((left, right) => left.localeCompare(right, "en"));
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
