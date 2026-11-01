import { asFiniteNumber, asRecord, idText, text } from "../../api/mappers";

export type FixtureScoreLine = {
  key: string;
  label: string;
  count: number | null;
  points: number;
};

const LINEUP_ROLES = ["goalkeeper", "defender", "midfield", "striker"] as const;

const SCORE_STATS: readonly (readonly [string, string])[] = [
  ["mins_played", "Minutes"],
  ["goals", "Goals"],
  ["goal_assist", "Assists"],
  ["offtarget_att_assist", "Shot assists"],
  ["pen_area_entries", "Box entries"],
  ["penalty_won", "Penalties won"],
  ["penalty_save", "Penalties saved"],
  ["saves", "Saves"],
  ["effective_clearance", "Clearances"],
  ["penalty_failed", "Penalties missed"],
  ["own_goals", "Own goals"],
  ["goals_conceded", "Goals conceded"],
  ["yellow_card", "Yellow card"],
  ["second_yellow_card", "Second yellow"],
  ["red_card", "Red card"],
  ["total_scoring_att", "Shots"],
  ["won_contest", "Dribbles won"],
  ["ball_recovery", "Recoveries"],
  ["poss_lost_all", "Possessions lost"],
  ["penalty_conceded", "Penalties conceded"],
];

const DAZN_STAT_KEYS = ["daznPoints", "dazn_points"] as const;

function statPair(value: unknown): { count: number | null; points: number } | null {
  if (Array.isArray(value)) {
    if (value.length >= 2) {
      const points = asFiniteNumber(value[1]);
      if (points == null) return null;
      return { count: asFiniteNumber(value[0]), points };
    }
    if (value.length === 1) {
      const points = asFiniteNumber(value[0]);
      if (points == null) return null;
      return { count: null, points };
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  const points = asFiniteNumber(record.points) ?? asFiniteNumber(record.fantasyPoints);
  if (points == null) return null;
  return { count: asFiniteNumber(record.count), points };
}

function lineFromValue(
  key: string,
  label: string,
  value: unknown,
): FixtureScoreLine | null {
  const pair = statPair(value);
  if (!pair || pair.points === 0) return null;
  return { key, label, count: pair.count, points: pair.points };
}

function daznStatPair(value: unknown): { count: number | null; points: number } | null {
  if (Array.isArray(value)) {
    const pair = statPair(value);
    if (!pair) return null;
    return pair.count == null ? { count: pair.points, points: pair.points } : pair;
  }
  const record = asRecord(value);
  if (!record) {
    const points = asFiniteNumber(value);
    return points == null ? null : { count: points, points };
  }
  if ("daznPoints" in record || "dazn_points" in record) {
    const points = asFiniteNumber(record.daznPoints) ??
      asFiniteNumber(record.dazn_points);
    return points == null ? null : { count: points, points };
  }
  const pair = statPair(value);
  if (!pair) return null;
  return pair.count == null ? { count: pair.points, points: pair.points } : pair;
}

function daznScoreLine(stats: Record<string, unknown>): FixtureScoreLine | null {
  for (const key of DAZN_STAT_KEYS) {
    if (!(key in stats)) continue;
    const pair = daznStatPair(stats[key]);
    if (!pair || pair.points === 0) continue;
    return { key, label: "DAZN", count: pair.count, points: pair.points };
  }
  return null;
}

function linesFromStats(stats: unknown): FixtureScoreLine[] {
  const record = asRecord(stats);
  if (!record) return [];
  const lines: FixtureScoreLine[] = [];
  for (const [key, label] of SCORE_STATS) {
    const line = lineFromValue(key, label, record[key]);
    if (line) lines.push(line);
  }
  const dazn = daznScoreLine(record);
  if (dazn) lines.push(dazn);
  return lines;
}

/**
 * Formats points with a sign so gains and losses stay distinct from a count.
 *
 * Args:
 *   points: Fantasy points contributed by one event.
 *
 * Returns:
 *   A signed integer, such as ``+2`` or ``-1``.
 */
export function signedFixturePoints(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}

/**
 * Reads the DAZN points the player details page shows for one matchweek.
 *
 * Args:
 *   payload: Parsed ``/stats/fixtures`` body.
 *   week: Matchweek shown on the lineup.
 *
 * Returns:
 *   The published DAZN value, including zero, or ``null`` when that week is absent.
 */
export function daznPointsForMatchweek(payload: unknown, week: number): number | null {
  const fixtures = asRecord(payload)?.fixtures;
  if (!Array.isArray(fixtures)) return null;
  for (const row of fixtures) {
    const record = asRecord(row);
    const fixture = asRecord(record?.fixture);
    if (asFiniteNumber(fixture?.matchweek) !== week) continue;
    const competition = text(fixture?.competition);
    if (competition != null && competition !== "laliga") continue;
    const dazn = asRecord(asRecord(record?.stats)?.daznPoints);
    const points = asFiniteNumber(dazn?.daznPoints);
    if (points != null) return points;
  }
  return null;
}

/**
 * Uses fixture-statistics DAZN when that matchweek has a value.
 *
 * Args:
 *   lines: Events already read from the roster.
 *   points: DAZN points from fixture statistics, or ``null`` while unknown.
 *
 * Returns:
 *   The roster events, with a DAZN row added or removed from the fixture value.
 */
export function withDaznScoreLine(
  lines: readonly FixtureScoreLine[],
  points: number | null,
): readonly FixtureScoreLine[] {
  if (points == null) return lines;
  const rest = lines.filter((line) => line.key !== "daznPoints" && line.key !== "dazn_points");
  if (points === 0) return rest;
  return [...rest, { key: "daznPoints", label: "DAZN", count: points, points }];
}

/**
 * Reads the matchweek events that add or remove Fantasy points.
 *
 * Args:
 *   master: Player master, catalog player, or a match-scoped player row.
 *   week: Matchweek shown on the lineup.
 *
 * Returns:
 *   Events whose points are not zero, or ``undefined`` when that week is absent.
 */
export function readFixtureScoreLines(
  master: unknown,
  week: number,
): FixtureScoreLine[] | undefined {
  const record = asRecord(master);
  if (!record) return undefined;
  const rows = record.lastStats ?? record.playerStats;
  if (Array.isArray(rows)) {
    const weekRow = rows
      .map(asRecord)
      .find((row) => row != null && asFiniteNumber(row.weekNumber) === week);
    if (!weekRow) return undefined;
    return linesFromStats(weekRow.stats);
  }
  if (record.stats != null) return linesFromStats(record.stats);
  return undefined;
}

/**
 * Accessible description of one fixture scoring event.
 *
 * Args:
 *   line: Event shown in the player hover.
 *
 * Returns:
 *   Event, then count when present, then signed points.
 */
export function fixtureScoreLineLabel(line: FixtureScoreLine): string {
  const amount = Math.abs(line.points) === 1 ? "point" : "points";
  const points = `${signedFixturePoints(line.points)} ${amount}`;
  if (line.count == null) return `${line.label}, ${points}`;
  return `${line.label}, ${line.count}, ${points}`;
}

/**
 * Indexes matchweek point events for players embedded in roster and lineup payloads.
 *
 * Later sources replace an earlier result only when they include that week.
 *
 * Args:
 *   week: Matchweek shown on the lineup.
 *   sources: Team, lineup, catalog, or calendar stats payloads.
 *
 * Returns:
 *   Scoring events keyed by master player id.
 */
export function fixtureScoreLinesByMasterId(
  week: number,
  sources: readonly unknown[],
): Map<string, readonly FixtureScoreLine[]> {
  const linesById = new Map<string, readonly FixtureScoreLine[]>();
  for (const source of sources) collectScoreLines(source, week, linesById);
  return linesById;
}

function isPlayerScoreRecord(record: Record<string, unknown>): boolean {
  if (record.lastStats != null || record.playerStats != null) return true;
  if (record.stats == null) return false;
  return record.players == null && record.local == null && record.visitor == null
    && record.formation == null && record.goalkeeper == null;
}

function applyMaster(
  master: Record<string, unknown> | null,
  week: number,
  linesById: Map<string, readonly FixtureScoreLine[]>,
): void {
  if (master == null) return;
  const hasStats = master.lastStats != null || master.playerStats != null || master.stats != null;
  if (!hasStats) return;
  const id = idText(master.id);
  if (!id) return;
  const lines = readFixtureScoreLines(master, week);
  if (lines === undefined) return;
  if (lines.length === 0) linesById.delete(id);
  else linesById.set(id, lines);
}

function collectPlayers(
  players: unknown,
  week: number,
  linesById: Map<string, readonly FixtureScoreLine[]>,
  nestedMaster: boolean,
): void {
  if (!Array.isArray(players)) return;
  for (const player of players) {
    const row = asRecord(player);
    const master = nestedMaster ? asRecord(row?.playerMaster) ?? row : row;
    applyMaster(master, week, linesById);
  }
}

function collectScoreLines(
  value: unknown,
  week: number,
  linesById: Map<string, readonly FixtureScoreLine[]>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectScoreLines(item, week, linesById);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  if (isPlayerScoreRecord(record)) applyMaster(record, week, linesById);
  collectPlayers(record.players, week, linesById, true);
  for (const side of ["local", "visitor"] as const) {
    collectPlayers(asRecord(record[side])?.players, week, linesById, false);
  }
  const formation = asRecord(record.formation) ?? record;
  for (const role of LINEUP_ROLES) {
    const slots = formation[role];
    if (!Array.isArray(slots)) continue;
    for (const slot of slots) {
      applyMaster(asRecord(asRecord(slot)?.playerMaster), week, linesById);
    }
  }
}
