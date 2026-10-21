import type { CurrentWeekDto, FixtureDto, FixtureWeatherDto, FixturesDto, WeekWeatherDto } from "../../api/schemas";
import { clubMediaFromId } from "../../api/clubMedia";
import { z } from "zod";

export const FIXTURE_TIME_ZONE = "Europe/Madrid";
const timestampSchema = z.iso.datetime({ offset: true });
export type PanelMatch = {
  key: string; id: string | null; homeId: number | null; awayId: number | null;
  home: { name: string; badge: string | null }; away: { name: string; badge: string | null };
  kickoff: string | null; kickoffMs: number | null;
  state: number | null; homeScore: number | null; awayScore: number | null;
  status: "scheduled" | "finished" | "unconfirmed"; venueKey: string;
};
export type PanelRound = {
  matches: PanelMatch[]; complete: boolean; started: boolean; consistent: boolean; signature: string;
};
export type RoundSelection = {
  week: number; mode: "loading" | "upcoming" | "active" | "finished" | "season-complete" | "unavailable";
  nextWeek: number | null;
};

export function validWeek(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 38 ? value : null;
}

/** Require an offset-aware full timestamp; reject locale/date-only guesses. */
export function kickoffTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !timestampSchema.safeParse(value).success) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function club(id: number | null) {
  const media = clubMediaFromId(id);
  return { name: media?.name ?? (id == null ? "Club unavailable" : `Club ${id}`), badge: media?.badge ?? null };
}

function positiveId(value: number | null | undefined): number | null {
  return value != null && Number.isInteger(value) && value > 0 ? value : null;
}

function score(value: number | null | undefined): number | null {
  return value != null && Number.isInteger(value) && value >= 0 ? value : null;
}

function match(row: FixtureDto, index: number, now: number): PanelMatch {
  const kickoffMs = [row.matchDate, row.date, row.time].map(kickoffTimestamp).find((value) => value != null) ?? null;
  const id = row.id == null || String(row.id).trim() === "" ? null : String(row.id);
  const state = row.matchState ?? null;
  const showScore = state === 7 || (state != null && state !== 1 && kickoffMs != null && kickoffMs <= now);
  const homeId = positiveId(row.localId);
  const awayId = positiveId(row.visitorId);
  return {
    key: id ?? `unknown-${index}`, id, homeId, awayId, home: club(homeId), away: club(awayId),
    kickoff: kickoffMs == null ? null : new Date(kickoffMs).toISOString(), kickoffMs, state,
    homeScore: showScore ? score(row.localScore) : null,
    awayScore: showScore ? score(row.visitorScore) : null,
    status: state === 1 ? "scheduled" : state === 7 ? "finished" : "unconfirmed",
    venueKey: JSON.stringify([row.venue, row.stadium, row.neutral, row.neutralVenue]),
  };
}

/** Ten distinct, complete club pairings are required to prove round completion. */
export function normalizeRound(rows: FixturesDto | undefined, now: number): PanelRound | undefined {
  if (rows === undefined) return undefined;
  const seen = new Map<string, string>();
  let consistent = true;
  const matches: PanelMatch[] = [];
  rows.forEach((row, index) => {
    const item = match(row, index, now);
    const fingerprint = JSON.stringify([item.homeId, item.awayId, item.kickoff, item.state, row.localScore, row.visitorScore]);
    if (item.id && seen.has(item.id)) {
      if (seen.get(item.id) !== fingerprint) consistent = false;
      return;
    }
    if (item.id) seen.set(item.id, fingerprint);
    if (!item.id || item.homeId == null || item.awayId == null || item.homeId === item.awayId) consistent = false;
    matches.push(item);
  });
  matches.sort((a, b) => (a.kickoffMs ?? Infinity) - (b.kickoffMs ?? Infinity) || a.key.localeCompare(b.key));
  const clubs = new Set(matches.flatMap((item) => [item.homeId, item.awayId]));
  consistent = consistent && matches.length === 10 && clubs.size === 20 && !clubs.has(null);
  return {
    matches, consistent,
    complete: consistent && matches.every((item) => item.state === 7),
    started: matches.some((item) => item.state === 7 ||
      (item.state != null && item.state !== 1 && item.kickoffMs != null && item.kickoffMs <= now)),
    signature: JSON.stringify(matches.map((item) => [item.id, item.homeId, item.awayId, item.kickoff, item.venueKey])),
  };
}

/** Competition round selection is independent of the lineup editing week. */
export function selectFixtureRound(
  current: CurrentWeekDto | undefined,
  rounds: ReadonlyMap<number, PanelRound | undefined>,
): RoundSelection | null {
  const week = validWeek(current?.weekNumber);
  if (week == null) return null;
  const round = rounds.get(week);
  const previous = validWeek(current?.previousWeek);
  const prior = previous != null && previous < week ? rounds.get(previous) : undefined;
  if (!round || round.matches.length === 0) {
    if (previous != null && prior?.started) return {
      week: previous, mode: prior.complete ? "finished" : "active", nextWeek: prior.complete ? week : null,
    };
    if (round) return { week, mode: current?.isLive === true ? "active" : "unavailable", nextWeek: null };
    return { week, mode: "loading", nextWeek: null };
  }
  if (round.complete) {
    const next = validWeek(current?.nextWeek);
    if (next != null && next > week) {
      const upcoming = rounds.get(next);
      if (upcoming && upcoming.matches.length > 0) return {
        week: next, mode: upcoming.complete ? "finished" : upcoming.started ? "active" : "upcoming", nextWeek: null,
      };
      return { week, mode: "finished", nextWeek: next };
    }
    return { week, mode: week === 38 ? "season-complete" : "finished", nextWeek: null };
  }
  if (round.started || current?.isLive === true) return { week, mode: "active", nextWeek: null };
  if (previous != null && previous < week) {
    if (!prior) return { week: previous, mode: "loading", nextWeek: null };
    if (!prior.complete) return { week: previous, mode: prior.started ? "active" : "unavailable", nextWeek: null };
  }
  return { week, mode: "upcoming", nextWeek: null };
}

export function weatherMatchesFixture(row: FixtureWeatherDto, item: PanelMatch): boolean {
  return item.id != null && row.fixtureId === item.id && row.localId === item.homeId &&
    row.visitorId === item.awayId && kickoffTimestamp(row.kickoff) === item.kickoffMs && item.kickoffMs != null;
}

/** Keep correctly identified forecasts through kickoff or optional provider failure. */
export function retainWeatherForecasts(previous: WeekWeatherDto | undefined, incoming: WeekWeatherDto): WeekWeatherDto {
  if (!previous || previous.weekNumber !== incoming.weekNumber) return incoming;
  return { ...incoming, matches: incoming.matches.map((row) => {
    if (!["match_started", "provider_unavailable"].includes(row.weather.reason ?? "")) return row;
    const old = previous.matches.find((candidate) => candidate.fixtureId === row.fixtureId &&
      candidate.localId === row.localId && candidate.visitorId === row.visitorId &&
      kickoffTimestamp(candidate.kickoff) === kickoffTimestamp(row.kickoff));
    const fetched = kickoffTimestamp(old?.fetchedAt);
    const kickoff = kickoffTimestamp(row.kickoff);
    if (!old?.weather.snapshot || fetched == null || kickoff == null || fetched >= kickoff) return row;
    return row.weather.reason === "match_started" ? old : {
      ...old, weather: { ...old.weather, reason: "provider_unavailable" },
    };
  }) };
}
