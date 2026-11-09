import { t } from "../../i18n";
import {
  kickoffTime, matchDate, resultWord, scoreText, signedDifference,
  type ClubMatchView, type ResultSummary,
} from "./teamPerformance";
import { pitchLine } from "./teamPitch";
import { predictabilityLabel } from "./teamLineupLabels";

/**
 * One short, plain-language sentence per widget on the Teams page. Each is built from the same
 * data the widget draws, so a reader who cannot scan the layout still gets its main takeaway.
 * Sentences are joined from fixed, translated pieces and avoid counted nouns, so no plural forms
 * are needed.
 */

function join(parts: readonly (string | null | false | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

function fixtureLine(match: ClubMatchView): string {
  return `${match.home} ${scoreText(match) ?? t("vs")} ${match.away}`;
}

/** Record, goals and difference of the matches in the window. */
export function overviewSummary(summary: ResultSummary): string {
  const played = summary.won + summary.drawn + summary.lost;
  if (played === 0) return t("No finished matches with a recorded score in this window.");
  return join([
    t("Played {{0}}: won {{1}}, drawn {{2}}, lost {{3}}.", {
      0: played, 1: summary.won, 2: summary.drawn, 3: summary.lost,
    }),
    t("Goals: {{0}} scored, {{1}} conceded ({{2}}).", {
      0: summary.goalsFor, 1: summary.goalsAgainst,
      2: signedDifference(summary.goalsFor - summary.goalsAgainst),
    }),
  ]);
}

/** How many matches are listed and the newest result, newest first. */
export function previousSummary(matches: readonly ClubMatchView[]): string | null {
  const latest = matches[0];
  if (!latest) return null;
  const detail = [fixtureLine(latest), matchDate(latest)].filter(Boolean).join(", ");
  return join([
    t("Played {{0}}, newest first.", { 0: matches.length }),
    latest.outcome
      ? t("Latest: {{0}} ({{1}}).", { 0: detail, 1: t(resultWord(latest.outcome)).toLowerCase() })
      : t("Latest: {{0}}.", { 0: detail }),
  ]);
}

/** How many matches are scheduled and the next one with its date and time. */
export function upcomingSummary(matches: readonly ClubMatchView[]): string | null {
  const next = matches[0];
  if (!next) return null;
  const when = [matchDate(next), kickoffTime(next)].filter(Boolean).join(", ");
  const detail = [`${next.home} ${t("vs")} ${next.away}`, when].filter(Boolean).join(", ");
  return join([
    t("Scheduled {{0}}.", { 0: matches.length }),
    t("Next: {{0}}.", { 0: detail }),
  ]);
}

/** The club's top scorers in the order the cards show them. */
export function mvpSummary(players: readonly { name: string; points: number }[]): string | null {
  if (players.length === 0) return null;
  return t("Ranked by FSYP: {{0}}.", {
    0: players.map((player) => `${player.name} (${player.points})`).join(", "),
  });
}

/** Squad size and the player with the most points. */
export function squadSummary(
  players: readonly { name: string; points?: number | null }[],
): string | null {
  if (players.length === 0) return null;
  let leader: { name: string; points: number } | null = null;
  for (const player of players) {
    if (typeof player.points === "number" && player.points > (leader?.points ?? 0)) {
      leader = { name: player.name, points: player.points };
    }
  }
  return join([
    t("Squad of {{0}}.", { 0: players.length }),
    leader && t("Highest FSYP: {{0}} ({{1}}).", { 0: leader.name, 1: leader.points }),
  ]);
}

type Starter = { name: string; position: string | null; probability?: number | null };

/** Formation such as 4-3-3 when the XI is one goalkeeper plus a clean split of ten outfielders. */
export function formationOf(players: readonly Pick<Starter, "position">[]): string | null {
  const count = { portero: 0, defensa: 0, mediocampista: 0, delantero: 0, other: 0 };
  for (const player of players) count[pitchLine(player.position)] += 1;
  if (players.length !== 11 || count.portero !== 1 || count.other !== 0) return null;
  return [count.defensa, count.mediocampista, count.delantero].join("-");
}

/** Formation and the starter whose place is least certain. */
export function startersSummary(players: readonly Starter[]): string | null {
  if (players.length === 0) return null;
  const formation = formationOf(players);
  let least: { name: string; probability: number } | null = null;
  let known = 0;
  for (const player of players) {
    if (typeof player.probability !== "number") continue;
    known += 1;
    if (least === null || player.probability < least.probability) {
      least = { name: player.name, probability: player.probability };
    }
  }
  return join([
    formation
      ? t("Predicted XI, {{0}} formation.", { 0: formation })
      : t("Predicted XI of {{0}} players.", { 0: players.length }),
    known > 1 && least && t("Least certain starter: {{0}} ({{1}}%).", {
      0: least.name, 1: least.probability,
    }),
  ]);
}

/** Coach name, how predictable the XI is, and the average start probability. */
export function coachSummary(prediction: {
  coach?: {
    name: string;
    seasonPredictabilityPercent?: number | null;
    matchdayPredictability?: string | null;
  } | null;
  summary?: { averageProbability?: number | null } | null;
}): string | null {
  const { coach, summary } = prediction;
  const matchday = predictabilityLabel(coach?.matchdayPredictability)?.label;
  const season = coach?.seasonPredictabilityPercent;
  const average = summary?.averageProbability;
  const parts = [
    coach ? t("Coach {{0}}.", { 0: coach.name }) : null,
    season != null ? t("Season predictability: {{0}}%.", { 0: season }) : null,
    matchday ? t("Matchday predictability: {{0}}.", { 0: matchday }) : null,
    average != null ? t("Average start probability: {{0}}%.", { 0: average }) : null,
  ];
  return parts.some(Boolean) ? join(parts) : null;
}

/** Substitute count, how many position groups they fall in, and the likeliest one. */
export function alternativesSummary(
  groups: readonly { players: readonly { name: string; probability?: number | null }[] }[],
): string | null {
  const players = groups.flatMap((group) => group.players);
  if (players.length === 0) return null;
  let likeliest: { name: string; probability: number } | null = null;
  for (const player of players) {
    if (typeof player.probability === "number"
      && player.probability > (likeliest?.probability ?? -1)) {
      likeliest = { name: player.name, probability: player.probability };
    }
  }
  return join([
    t("Substitutes: {{0}}. Position groups: {{1}}.", { 0: players.length, 1: groups.length }),
    likeliest && t("Likeliest: {{0}} ({{1}}%).", {
      0: likeliest.name, 1: likeliest.probability,
    }),
  ]);
}

/** Injury count and the most important injured player, with their role when known. */
export function injuriesSummary(
  rows: readonly { name: string; hierarchy: string | null }[],
): string | null {
  const first = rows[0];
  if (!first) return null;
  return join([
    t("Injured: {{0}}.", { 0: rows.length }),
    first.hierarchy
      ? t("Most important: {{0}} ({{1}}).", { 0: first.name, 1: first.hierarchy })
      : t("Most important: {{0}}.", { 0: first.name }),
  ]);
}

/** Event count, the period it covers and the newest event. */
export function newsSummary(
  count: number, covering: string, latest: { kind: string; when: string } | null,
): string | null {
  if (count === 0) return null;
  return join([
    t("Events: {{0}}, covering {{1}}.", { 0: count, 1: covering }),
    latest && t("Latest: {{0}}, {{1}}.", { 0: latest.kind, 1: latest.when }),
  ]);
}
