import { asFiniteNumber, asRecord, idText, fixtureHasStarted, weekPointsByMasterId } from "../../../api/mappers";

export const FORM_MATCHES = 5;
export const FORM_DISPLAY_MATCHES = 3;

function formWeekRows(
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
  if (playedThrough != null && playedThrough >= 0) {
    rows = rows.filter((row) => row.week <= playedThrough);
  }
  return rows.sort((left, right) => right.week - left.week);
}

function recentFormWeeks(
  lastStats: unknown,
  playedThrough: number | null = null,
): { week: number; points: number }[] {
  return formWeekRows(lastStats, playedThrough).slice(0, FORM_MATCHES);
}

function allFormWeeks(
  lastStats: unknown,
  playedThrough: number | null = null,
): { week: number; points: number }[] {
  return formWeekRows(lastStats, playedThrough);
}

/** Sum of the points from the latest five played matchweeks. */
export function formPoints(
  lastStats: unknown,
  playedThrough: number | null = null,
): number | null {
  const weeks = recentFormWeeks(lastStats, playedThrough);
  return weeks.length === 0 ? null : weeks.reduce((sum, row) => sum + row.points, 0);
}

/** Average the latest three played matchweek scores for numeric Form filters. */
export function formAverageLastThree(recent: readonly number[]): number | null {
  const values = recent.slice(0, FORM_DISPLAY_MATCHES).filter(Number.isFinite);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Played matchweek scores for the form column, newest first. */
export function formRecentPoints(
  lastStats: unknown,
  playedThrough: number | null = null,
): number[] {
  return allFormWeeks(lastStats, playedThrough).map((row) => row.points);
}

/** Matchweek numbers aligned with ``formRecentPoints`` (newest first). */
export function formRecentWeekNumbers(
  lastStats: unknown,
  playedThrough: number | null = null,
): number[] {
  return allFormWeeks(lastStats, playedThrough).map((row) => row.week);
}

export type FormRecentWindow = {
  points: number[];
  weeks: number[];
  /** Clamped start index actually used (0 = most recent). */
  offset: number;
  canGoOlder: boolean;
  canGoNewer: boolean;
};

/** Trims ``recent`` and ``weeks`` to a shared length (newest-first rows). */
export function formRecentSeries(
  recent: readonly number[],
  weeks: readonly number[],
): { recent: number[]; weeks: number[] } {
  const length = Math.min(recent.length, weeks.length);
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
    return { points: [], weeks: [], offset: 0, canGoOlder: false, canGoNewer: false };
  }
  const maxStart = Math.max(0, length - windowSize);
  const offset = Math.min(Math.max(0, startIndex), maxStart);
  const end = Math.min(offset + windowSize, length);
  return {
    points: capped.recent.slice(offset, end),
    weeks: capped.weeks.slice(offset, end),
    offset,
    canGoOlder: offset < maxStart,
    canGoNewer: offset > 0,
  };
}

/** Oldest matchweek left (e.g. F5, F6, F7) for the form column. */
export function formWindowChronological(view: FormRecentWindow): FormRecentWindow {
  return {
    ...view,
    points: [...view.points].reverse(),
    weeks: [...view.weeks].reverse(),
  };
}

/** Newest-first scores for the form column (last three matchweeks). */
export function formDisplayPoints(recent: readonly number[]): number[] {
  return recent.slice(0, FORM_DISPLAY_MATCHES);
}

/** Matchweek numbers from ``playedThrough`` down to 1 (newest first). */
export function recentFormWeekNumbers(playedThrough: number, count?: number): number[] {
  if (!Number.isFinite(playedThrough) || playedThrough < 1) return [];
  const weeks: number[] = [];
  for (let week = playedThrough; week >= 1; week -= 1) {
    if (count != null && weeks.length >= count) break;
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
  const form = formRecent
    .slice(0, FORM_MATCHES)
    .reduce((sum, points) => sum + points, 0);
  return { form: formRecent.length === 0 ? null : form, formRecent };
}

/** Calendar scores from fixtures that have started, separate from scheduled zeroes. */
export function calendarFormContext(
  weekNumbers: readonly number[],
  statsData: readonly unknown[],
  playedThrough: number,
  currentWeek: number,
) {
  const statsByWeek = new Map<number, Map<string, number>>();
  const pendingByWeek = new Map<number, Set<string>>();
  weekNumbers.forEach((week, index) => {
    const matches = Array.isArray(statsData[index]) ? statsData[index] : [];
    const pending = new Set<string>();
    for (const match of matches) {
      if (fixtureHasStarted(match)) continue;
      const record = asRecord(match);
      for (const key of ["local", "visitor"]) {
        const players = asRecord(record?.[key])?.players;
        if (!Array.isArray(players)) continue;
        for (const player of players) {
          const id = idText(asRecord(player)?.id);
          if (id) pending.add(id);
        }
      }
    }
    pendingByWeek.set(week, pending);
    statsByWeek.set(week, weekPointsByMasterId(
      matches.filter(fixtureHasStarted),
    ));
  });
  return { weekNumbers, statsByWeek, pendingByWeek, playedThrough, currentWeek };
}

/** Merge played history with live scores without averaging scheduled placeholders. */
export function playerFormHistory(
  playerId: string | null,
  lastStats: unknown,
  calendar?: {
    playedThrough: number;
    currentWeek?: number;
    weekNumbers: readonly number[];
    statsByWeek: ReadonlyMap<number, ReadonlyMap<string, number>>;
    pendingByWeek?: ReadonlyMap<number, ReadonlySet<string>>;
  },
) {
  const rows = new Map(formWeekRows(lastStats, calendar?.playedThrough).map(
    (row) => [row.week, row.points],
  ));
  if (calendar && playerId) {
    for (const week of calendar.weekNumbers) {
      if (calendar.pendingByWeek?.get(week)?.has(playerId)) {
        rows.delete(week);
        continue;
      }
      const points = calendar.statsByWeek.get(week)?.get(playerId);
      if (points != null) rows.set(week, points);
    }
  }
  const latestPlayedWeek = Math.max(calendar?.playedThrough ?? 0, 0, ...rows.keys());
  for (let week = latestPlayedWeek; week >= 1; week -= 1) {
    if (playerId && calendar?.pendingByWeek?.get(week)?.has(playerId)) continue;
    if (!rows.has(week)) rows.set(week, 0);
  }
  const sorted = [...rows].sort(([left], [right]) => right - left);
  const currentWeek = calendar?.currentWeek;
  return {
    recent: sorted.map(([, points]) => points),
    weeks: sorted.map(([week]) => week),
    pendingFormWeek: currentWeek && !rows.has(currentWeek) ? currentWeek : undefined,
  };
}
