import type { PlayerAverage } from "./playerAverages";

/** Plain-language guides, not a claim that all providers classify events identically. */
export const METRIC_GUIDE: Record<string, { group: string; meaning: string }> = {
  G: { group: "Shooting", meaning: "Goals scored." },
  T: { group: "Shooting", meaning: "All attempts to score, including blocked attempts." },
  TaP: { group: "Shooting", meaning: "Goal attempts on target, including goals and saves." },
  A: { group: "Chance creation", meaning: "Final pass or touch before a teammate scores." },
  "A SinGol": { group: "Chance creation", meaning: "Final pass creating a clear goal-scoring opportunity, as defined by LaLiga Fantasy." },
  PC: { group: "Chance creation", meaning: "Passes leading directly to a teammate’s shot without a goal." },
  CF: { group: "Chance creation", meaning: "Corners earned, rather than corners taken." },
  Reg: { group: "Ball use", meaning: "Opponents beaten while keeping possession." },
  C: { group: "Ball use", meaning: "Deliveries from wide areas towards teammates near goal." },
  CP: { group: "Ball use", meaning: "Crosses that reach a teammate." },
  Pas: { group: "Ball use", meaning: "Passes that reach a teammate; a count, not a completion percentage." },
  "-Pos": { group: "Ball use", meaning: "Recorded losses of possession attributed to the player." },
  DE: { group: "Defending", meaning: "Defensive actions clearing danger, without an intended teammate." },
  PI: { group: "Defending", meaning: "Opposition passes cut out by anticipating their path." },
  BR: { group: "Defending", meaning: "Recoveries or steals of possession, as classified by the source." },
  FR: { group: "Discipline", meaning: "Fouls suffered that earn a free kick or penalty." },
  "-FC": { group: "Discipline", meaning: "Infringements penalised with a free kick or penalty." },
  S: { group: "Goalkeeping", meaning: "Goalkeeper stops that prevent a goal from an opponent’s attempt." },
  GC: { group: "Goalkeeping", meaning: "Goals allowed in the source’s playing sample; not individual errors." },
};

export const METRIC_GROUPS = [
  { title: "Shooting", description: "Finishing and shot volume" },
  { title: "Chance creation", description: "Opportunities made for teammates" },
  { title: "Ball use", description: "Progression, distribution and possession" },
  { title: "Defending", description: "Disrupting play and removing danger" },
  { title: "Discipline", description: "Fouls won and conceded" },
  { title: "Goalkeeping", description: "Stops and goals allowed" },
  { title: "Other statistics", description: "Additional figures supplied by the source" },
] as const;

/** Rounded means only support approximate shares within the same season sample. */
export function seasonMetricShare(rows: readonly PlayerAverage[], partCode: string, totalCode: string) {
  const part = rows.find((row) => row.code === partCode);
  const total = rows.find((row) => row.code === totalCode);
  if (part?.source !== "futbolfantasy" || total?.source !== "futbolfantasy" ||
    part.value == null || total.value == null || !Number.isFinite(part.value) ||
    !Number.isFinite(total.value) || total.value <= 0 || part.value < 0 || part.value > total.value) {
    return null;
  }
  return { part: part.value, total: total.value, percent: Math.round(part.value / total.value * 100) };
}

export function metricSource(row: PlayerAverage): string {
  if (row.source === "fantasy") {
    return `Fantasy · ${row.sampleSize ?? "Unknown"} played matchweeks`;
  }
  return row.source === "futbolfantasy" ? "FutbolFantasy · Season" : "Not supplied";
}
