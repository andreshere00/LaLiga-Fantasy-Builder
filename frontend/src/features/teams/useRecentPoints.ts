import { useQueries, useQuery } from "@tanstack/react-query";
import { getJson, paths } from "../../api/client";
import { asFiniteNumber, asRecord } from "../../api/mappers";
import { CALENDAR_STALE_MS } from "../../api/queries";
import { useAuth } from "../../auth/AuthProvider";
import { sortMatchesByDate } from "../players/playerDetailWidgets";

export type RecentPoint = { matchweek: number | null; points: number | null };


export function recentPointsFrom(response: unknown, size = 5): RecentPoint[] {
  const rows = asRecord(response)?.fixtures;
  if (!Array.isArray(rows)) return [];
  const laliga = rows.filter((row) => {
    const competition = asRecord(asRecord(row)?.fixture)?.competition;
    return competition == null || competition === "laliga";
  });
  return sortMatchesByDate(laliga, "asc").slice(-size).map((match) => {
    const record = asRecord(match);
    const fixture = asRecord(record?.fixture);
    return {
      matchweek: asFiniteNumber(fixture?.matchweek),
      points: asFiniteNumber(record?.fantasyPointsTotal),
    };
  });
}

const STAT_KEYS = [
  "minutesPlayed", "goals", "assists", "bigChancesCreated", "ballsIntoBox", "shots", "successfulDribbles",
  "recoveries", "clearances", "saves", "penaltiesWon", "penaltiesSaved", "penaltiesCommitted",
  "penaltiesMissed", "ownGoals", "goalsConceded", "yellowCards", "redCard", "ballsLost",
] as const;
export type MatchStatKey = (typeof STAT_KEYS)[number];

export type RecentMatch = {
  matchweek: number | null;
  opponent: string | null;
  isHome: boolean | null;
  score: string | null;
  result: "W" | "D" | "L" | null;
  points: number | null;
  /** Only stats the match reports: a count, the Fantasy points it earned, or both. */
  stats: { key: MatchStatKey; count: number | null; points: number | null }[];
};

/** The last matches with their published stat lines, oldest first. */
export function recentMatchesFrom(response: unknown, size = 5): RecentMatch[] {
  const rows = asRecord(response)?.fixtures;
  if (!Array.isArray(rows)) return [];
  const laliga = rows.filter((row) => {
    const competition = asRecord(asRecord(row)?.fixture)?.competition;
    return competition == null || competition === "laliga";
  });
  return sortMatchesByDate(laliga, "asc").slice(-size).map((match) => {
    const record = asRecord(match);
    const fixture = asRecord(record?.fixture);
    const stats = asRecord(record?.stats);
    const home = asFiniteNumber(fixture?.homeScore);
    const away = asFiniteNumber(fixture?.awayScore);
    const result = fixture?.result;
    return {
      matchweek: asFiniteNumber(fixture?.matchweek),
      opponent: typeof fixture?.opponent === "string" ? fixture.opponent : null,
      isHome: typeof fixture?.isHome === "boolean" ? fixture.isHome : null,
      score: home != null && away != null ? `${home}-${away}` : null,
      result: result === "W" || result === "D" || result === "L" ? result : null,
      points: asFiniteNumber(record?.fantasyPointsTotal),
      stats: STAT_KEYS.flatMap((key) => {
        const value = asRecord(stats?.[key]);
        const count = key === "minutesPlayed"
          ? asFiniteNumber(value?.count) ?? asFiniteNumber(record?.minutesPlayed)
          : asFiniteNumber(value?.count);
        const points = asFiniteNumber(value?.fantasyPoints);
        return (count ?? 0) !== 0 || (points ?? 0) !== 0 ? [{ key, count, points }] : [];
      }),
    };
  });
}

function pointsQuery(id: string, accessToken: string | null, userId: string | undefined) {
  return {
    queryKey: ["players", "recent-points", userId, id],
    enabled: accessToken != null && id.length > 0,
    staleTime: CALENDAR_STALE_MS,
    retry: false,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      getJson(paths.playerLaligaPoints(id), accessToken ?? "", {
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      }),
  };
}

/** One player's last LaLiga matches with stats; shares the cache of {@link useRecentPoints}. */
export function useRecentMatches(id: string) {
  const { accessToken, user } = useAuth();
  const query = useQuery(pointsQuery(id, accessToken, user?.userId));
  return { matches: recentMatchesFrom(query.data), loading: query.isPending && query.fetchStatus !== "idle", failed: query.isError };
}

/** Loads the last five LaLiga matches' Fantasy points per master player id. */
export function useRecentPoints(ids: readonly string[]) {
  const { accessToken, user } = useAuth();
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  const queries = useQueries({ queries: unique.map((id) => pointsQuery(id, accessToken, user?.userId)) });
  return new Map(unique.map((id, index) => [id, recentPointsFrom(queries[index]?.data)]));
}
