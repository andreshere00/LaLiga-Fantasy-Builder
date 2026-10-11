import { asFiniteNumber, asRecord, text } from "../../api/mappers";

export type PlayerAverage = {
  code: string;
  label: string;
  value: number | null;
  source: "futbolfantasy" | "fantasy" | "unavailable";
  sampleSize: number | null;
};

type AverageSpec = {
  code: string;
  label: string;
  fantasyKeys?: readonly string[];
};

const AVERAGE_SPECS: readonly AverageSpec[] = [
  { code: "G", label: "Goals", fantasyKeys: ["goals"] },
  {
    code: "TaP",
    label: "Shots on target",
    fantasyKeys: ["total_scoring_att_on_target", "scoring_att_on_target", "shots_on_target"],
  },
  { code: "T", label: "Shots", fantasyKeys: ["total_scoring_att"] },
  { code: "CF", label: "Corners won", fantasyKeys: ["won_corners", "corners_won"] },
  { code: "Reg", label: "Successful dribbles", fantasyKeys: ["won_contest"] },
  { code: "C", label: "Crosses", fantasyKeys: ["crosses", "total_crosses"] },
  {
    code: "CP",
    label: "Accurate crosses",
    fantasyKeys: ["accurate_crosses", "crosses_accurate", "successful_crosses"],
  },
  { code: "A", label: "Assists", fantasyKeys: ["goal_assist"] },
  { code: "A SinGol", label: "Assists without a goal" },
  { code: "PC", label: "Key passes", fantasyKeys: ["key_passes", "key_pass"] },
  {
    code: "Pas",
    label: "Completed passes",
    fantasyKeys: [
      "accurate_passes",
      "passes_completed",
      "completed_passes",
      "passes_accurate",
      "passes",
    ],
  },
  { code: "-Pos", label: "Possessions lost", fantasyKeys: ["poss_lost_all"] },
  { code: "DE", label: "Effective clearances", fantasyKeys: ["effective_clearance"] },
  { code: "PI", label: "Interceptions", fantasyKeys: ["interceptions", "interception"] },
  { code: "BR", label: "Balls recovered", fantasyKeys: ["ball_recovery"] },
  { code: "FR", label: "Fouls won", fantasyKeys: ["fouls_won", "fouls_received", "was_fouled"] },
  {
    code: "-FC",
    label: "Fouls committed",
    fantasyKeys: ["fouls_committed", "committed_fouls", "fouls"],
  },
  { code: "S", label: "Saves", fantasyKeys: ["saves"] },
  { code: "GC", label: "Goals conceded", fantasyKeys: ["goals_conceded"] },
];

const OUTFIELD_HIGHLIGHTS = ["G", "A", "PC", "Reg", "A SinGol", "TaP"] as const;
const DEFENDER_HIGHLIGHTS = ["G", "A", "BR", "DE", "FR", "CF"] as const;
const GOALKEEPER_HIGHLIGHTS = ["DE", "PI", "BR", "-Pos", "S", "GC"] as const;

type FantasyWeek = {
  stats: Record<string, unknown>;
  totalPoints: number | null;
};

function fantasyCount(stats: Record<string, unknown>, key: string): number | null {
  const raw = stats[key];
  const count = Array.isArray(raw) ? asFiniteNumber(raw[0]) : null;
  return count != null && Number.isInteger(count) && count >= 0 ? count : null;
}

function playedWeek(week: FantasyWeek): boolean {
  const minutes = fantasyCount(week.stats, "mins_played");
  if (minutes != null) return minutes > 0;
  if (week.totalPoints != null && week.totalPoints !== 0) return true;
  return Object.values(week.stats).some(
    (value) => Array.isArray(value) && value.length === 2 && (asFiniteNumber(value[0]) ?? 0) > 0,
  );
}

function fantasyWeeks(catalogPlayer: unknown): FantasyWeek[] {
  const raw = asRecord(catalogPlayer)?.lastStats;
  if (!Array.isArray(raw)) return [];
  const weeks = new Map<number, FantasyWeek>();
  for (const item of raw) {
    const row = asRecord(item);
    const weekNumber = asFiniteNumber(row?.weekNumber);
    const stats = asRecord(row?.stats);
    if (weekNumber == null || stats == null || weeks.has(weekNumber)) continue;
    const week = { stats, totalPoints: asFiniteNumber(row?.totalPoints) };
    if (playedWeek(week)) weeks.set(weekNumber, week);
  }
  return [...weeks.values()];
}

function fantasyAverage(
  weeks: readonly FantasyWeek[],
  keys: readonly string[] | undefined,
): number | null {
  if (!keys || weeks.length === 0) return null;
  let total = 0;
  let found = false;
  for (const week of weeks) {
    const count = keys
      .map((key) => fantasyCount(week.stats, key))
      .find((value) => value != null) ?? null;
    if (count == null) continue;
    total += count;
    found = true;
  }
  return found ? Math.round((total / weeks.length) * 100) / 100 : null;
}

/** Prefer season totals and fill missing averages from played Fantasy matchweeks. */
export function playerAverages(scrapedRows: unknown, catalogPlayer: unknown): PlayerAverage[] {
  const scraped = new Map<string, { label: string; value: number | null }>();
  if (Array.isArray(scrapedRows)) {
    for (const item of scrapedRows) {
      const row = asRecord(item);
      const code = text(row?.code);
      if (!code) continue;
      scraped.set(code, {
        label: text(row?.label) ?? code,
        value: asFiniteNumber(row?.value),
      });
    }
  }
  const weeks = fantasyWeeks(catalogPlayer);
  const rows: PlayerAverage[] = AVERAGE_SPECS.map((spec) => {
    const published = scraped.get(spec.code);
    if (published?.value != null) {
      return {
        code: spec.code,
        label: published.label,
        value: published.value,
        source: "futbolfantasy",
        sampleSize: null,
      };
    }
    const fallback = fantasyAverage(weeks, spec.fantasyKeys);
    return {
      code: spec.code,
      label: published?.label ?? spec.label,
      value: fallback,
      source: fallback != null ? "fantasy" : "unavailable",
      sampleSize: fallback != null ? weeks.length : null,
    };
  });
  for (const [code, published] of scraped) {
    if (AVERAGE_SPECS.some((spec) => spec.code === code)) continue;
    rows.push({
      code,
      label: published.label,
      value: published.value,
      source: published.value != null ? "futbolfantasy" : "unavailable",
      sampleSize: null,
    });
  }
  return rows;
}

export function highlightedAverages(
  rows: readonly PlayerAverage[],
  positionId: number | null,
): PlayerAverage[] {
  const codes = positionId === 1
    ? GOALKEEPER_HIGHLIGHTS
    : positionId === 2
      ? DEFENDER_HIGHLIGHTS
      : OUTFIELD_HIGHLIGHTS;
  const byCode = new Map(rows.map((row) => [row.code, row]));
  return codes.map((code) => byCode.get(code)).filter((row): row is PlayerAverage => row != null);
}

export function remainingAverages(
  rows: readonly PlayerAverage[],
  highlights: readonly PlayerAverage[],
): PlayerAverage[] {
  const highlighted = new Set(highlights.map((row) => row.code));
  return rows.filter((row) => !highlighted.has(row.code));
}
