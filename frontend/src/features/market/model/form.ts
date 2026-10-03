import { asFiniteNumber, asRecord } from "../../../api/mappers";

const FORM_MATCHES = 5;
export const FORM_DISPLAY_MATCHES = 3;

function recentFormWeeks(
  lastStats: unknown,
  playedThrough: number | null = null,
): { week: number; points: number }[] {
  if (!Array.isArray(lastStats)) return [];
  let rows = lastStats
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => row != null)
    .map((row) => ({
      week: asFiniteNumber(row.weekNumber) ?? 0,
      points:
        asFiniteNumber(row.totalPoints) ?? asFiniteNumber(row.weekPoints),
    }))
    .filter(
      (row): row is { week: number; points: number } =>
        row.points != null && row.week >= 1,
    );
  if (playedThrough != null && playedThrough >= 1) {
    rows = rows.filter((row) => row.week <= playedThrough);
  }
  return rows.sort((left, right) => right.week - left.week).slice(0, FORM_MATCHES);
}

/** Sum of the points from the latest five played matchweeks. */
export function formPoints(
  lastStats: unknown,
  playedThrough: number | null = null,
): number | null {
  const weeks = recentFormWeeks(lastStats, playedThrough);
  return weeks.length === 0 ? null : weeks.reduce((sum, row) => sum + row.points, 0);
}

/** Latest five matchweek scores, newest first. */
export function formRecentPoints(
  lastStats: unknown,
  playedThrough: number | null = null,
): number[] {
  return recentFormWeeks(lastStats, playedThrough).map((row) => row.points);
}

/** Matchweek numbers aligned with ``formRecentPoints`` (newest first, at most three). */
export function formRecentWeekNumbers(
  lastStats: unknown,
  playedThrough: number | null = null,
): number[] {
  return recentFormWeeks(lastStats, playedThrough)
    .map((row) => row.week)
    .slice(0, FORM_DISPLAY_MATCHES);
}

/** Newest-first scores for the form column (last three matchweeks). */
export function formDisplayPoints(recent: readonly number[]): number[] {
  return recent.slice(0, FORM_DISPLAY_MATCHES);
}

/** Matchweek numbers from ``playedThrough`` down to 1 (newest first, at most ``count``). */
export function recentFormWeekNumbers(playedThrough: number, count = FORM_MATCHES): number[] {
  if (!Number.isFinite(playedThrough) || playedThrough < 1) return [];
  const weeks: number[] = [];
  for (let week = playedThrough; week >= 1 && weeks.length < count; week -= 1) {
    weeks.push(week);
  }
  return weeks;
}

/** Form totals from calendar matchweek stats when ``lastStats`` is absent. */
export function formFromCalendarWeeks(
  playerId: string | null,
  weekNumbers: readonly number[],
  statsByWeek: ReadonlyMap<number, ReadonlyMap<string, number>>,
): { form: number | null; formRecent: number[] } {
  if (!playerId || weekNumbers.length === 0) {
    return { form: null, formRecent: [] };
  }
  const formRecent = weekNumbers.map(
    (week) => statsByWeek.get(week)?.get(playerId) ?? 0,
  );
  return { form: formRecent.reduce((sum, points) => sum + points, 0), formRecent };
}
