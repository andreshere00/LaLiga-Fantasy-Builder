import { asFiniteNumber, asRecord } from "../../../api/mappers";

export const FORM_MATCHES = 5;
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

/** Matchweek numbers aligned with ``formRecentPoints`` (newest first, up to five). */
export function formRecentWeekNumbers(
  lastStats: unknown,
  playedThrough: number | null = null,
): number[] {
  return recentFormWeeks(lastStats, playedThrough).map((row) => row.week);
}

export type FormRecentWindow = {
  points: number[];
  weeks: number[];
  canGoOlder: boolean;
  canGoNewer: boolean;
};

/** Keeps only the last ``FORM_MATCHES`` played matchweeks (newest first). */
export function formRecentSeries(
  recent: readonly number[],
  weeks: readonly number[],
): { recent: number[]; weeks: number[] } {
  const length = Math.min(recent.length, weeks.length, FORM_MATCHES);
  return {
    recent: recent.slice(0, length),
    weeks: weeks.slice(0, length),
  };
}

/** A sliding window over newest-first form scores (``startIndex`` 0 = most recent). */
export function formRecentWindow(
  recent: readonly number[],
  weeks: readonly number[],
  startIndex: number,
  windowSize = FORM_DISPLAY_MATCHES,
): FormRecentWindow {
  const capped = formRecentSeries(recent, weeks);
  const length = capped.recent.length;
  if (length === 0) {
    return { points: [], weeks: [], canGoOlder: false, canGoNewer: false };
  }
  const maxStart = Math.max(0, length - windowSize);
  const offset = Math.min(Math.max(0, startIndex), maxStart);
  const end = Math.min(offset + windowSize, length);
  return {
    points: capped.recent.slice(offset, end),
    weeks: capped.weeks.slice(offset, end),
    canGoOlder: offset < maxStart,
    canGoNewer: offset > 0,
  };
}

/** Oldest matchweek left (e.g. F5, F6, F7) for the form column. */
export function formWindowChronological(window: FormRecentWindow): FormRecentWindow {
  return {
    points: [...window.points].reverse(),
    weeks: [...window.weeks].reverse(),
    canGoOlder: window.canGoOlder,
    canGoNewer: window.canGoNewer,
  };
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
