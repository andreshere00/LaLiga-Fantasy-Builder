import {
  asFiniteNumber,
  asRecord,
  fixtureHasStarted,
  idText,
} from "../../api/mappers";

export type FixtureHighlight = {
  kind: "goal" | "clean-sheet";
  goals: number;
};

const LINEUP_ROLES = ["goalkeeper", "defender", "midfield", "striker"] as const;

/**
 * Decides whether the lineup pitch should mark goals for this matchweek.
 *
 * Past matchweeks qualify. The current matchweek qualifies once any fixture
 * has started, including after every match has finished.
 *
 * Args:
 *   week: Displayed matchweek.
 *   currentWeek: Open matchweek from the calendar.
 *   fixtures: Fixtures or match stats for the displayed week.
 *
 * Returns:
 *   Whether pitch cards may use a goal highlight.
 */
export function lineupFixtureHighlightsVisible(
  week: number,
  currentWeek: number,
  fixtures: readonly unknown[],
): boolean {
  if (week < 1 || week > currentWeek) return false;
  if (week < currentWeek) return true;
  return fixtures.some(fixtureHasStarted);
}

/**
 * Reports whether the displayed matchweek still has a match in progress.
 *
 * Args:
 *   fixtures: Fixtures for the displayed week.
 *
 * Returns:
 *   True after kickoff and before every match is finished.
 */
export function fixturesStillInPlay(fixtures: readonly unknown[]): boolean {
  if (fixtures.length === 0) return false;
  const finished = fixtures.every(
    (fixture) => asFiniteNumber(asRecord(fixture)?.matchState) === 7,
  );
  return fixtures.some(fixtureHasStarted) && !finished;
}

/**
 * Reads a goal or clean-sheet highlight from one player master.
 *
 * Fantasy week stats store `[count, points]`. A goalkeeper who played and
 * conceded none is highlighted. An explicit zero does not.
 *
 * Args:
 *   master: Player master record, including `lastStats` or `playerStats`.
 *   week: Matchweek shown on the lineup.
 *   goalkeeperHint: Treat a missing position as a goalkeeper.
 *
 * Returns:
 *   The highlight, `null` when that week has no highlight, or `undefined`
 *   when the week or its goal count is absent.
 */
export function readFixtureHighlight(
  master: unknown,
  week: number,
  goalkeeperHint = false,
): FixtureHighlight | null | undefined {
  const record = asRecord(master);
  const rows = record?.lastStats ?? record?.playerStats;
  if (!Array.isArray(rows)) return undefined;
  const weekRow = rows
    .map(asRecord)
    .find((row) => row != null && asFiniteNumber(row.weekNumber) === week);
  if (!weekRow) return undefined;
  const stats = asRecord(weekRow.stats);
  if (!stats || !Object.hasOwn(stats, "goals")) return undefined;
  const goals = eventCount(stats.goals);
  if (goals != null && goals >= 1) return { kind: "goal", goals };
  const positionId = asFiniteNumber(record?.positionId);
  const goalkeeper = positionId === 1 || (positionId == null && goalkeeperHint);
  if (!goalkeeper) return null;
  if (!Object.hasOwn(stats, "mins_played") || !Object.hasOwn(stats, "goals_conceded")) {
    return null;
  }
  const minutes = eventCount(stats.mins_played);
  const conceded = eventCount(stats.goals_conceded);
  if (minutes != null && minutes > 0 && conceded === 0) {
    return { kind: "clean-sheet", goals: 0 };
  }
  return null;
}

/**
 * Accessible description of a pitch highlight.
 *
 * Args:
 *   highlight: Highlight shown on the player card.
 *
 * Returns:
 *   Short phrase, or `null` when the card is not highlighted.
 */
export function fixtureHighlightLabel(
  highlight: FixtureHighlight | null | undefined,
): string | null {
  if (!highlight) return null;
  if (highlight.kind === "clean-sheet") return "No goals conceded";
  if (highlight.goals === 1) return "Scored a goal";
  return `Scored ${highlight.goals} goals`;
}

/**
 * Indexes goal highlights for the players embedded in roster and lineup payloads.
 *
 * Later sources replace an earlier result only when they include that week.
 *
 * Args:
 *   week: Matchweek shown on the lineup.
 *   sources: Team and lineup payloads that may embed player masters.
 *
 * Returns:
 *   Highlights keyed by master player id.
 */
export function fixtureHighlightsByMasterId(
  week: number,
  sources: readonly unknown[],
): Map<string, FixtureHighlight> {
  const highlights = new Map<string, FixtureHighlight>();
  for (const source of sources) collectHighlights(source, week, highlights);
  return highlights;
}

function eventCount(value: unknown): number | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const count = asFiniteNumber(value[0]);
  if (count == null || count < 0) return null;
  return count;
}

function applyHighlight(
  highlights: Map<string, FixtureHighlight>,
  master: unknown,
  week: number,
  goalkeeperHint: boolean,
): void {
  const id = idText(asRecord(master)?.id);
  if (!id) return;
  const highlight = readFixtureHighlight(master, week, goalkeeperHint);
  if (highlight === undefined) return;
  if (highlight == null) highlights.delete(id);
  else highlights.set(id, highlight);
}

function collectHighlights(
  value: unknown,
  week: number,
  highlights: Map<string, FixtureHighlight>,
): void {
  const record = asRecord(value);
  if (!record) return;
  const players = record.players;
  if (Array.isArray(players)) {
    for (const player of players) {
      applyHighlight(highlights, asRecord(player)?.playerMaster, week, false);
    }
  }
  const formation = asRecord(record.formation) ?? record;
  for (const role of LINEUP_ROLES) {
    const slots = formation[role];
    if (!Array.isArray(slots)) continue;
    for (const slot of slots) {
      applyHighlight(
        highlights,
        asRecord(slot)?.playerMaster,
        week,
        role === "goalkeeper",
      );
    }
  }
}
