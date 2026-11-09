import { useQueries } from "@tanstack/react-query";
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

/** Loads the last five LaLiga matches' Fantasy points per master player id. */
export function useRecentPoints(ids: readonly string[]) {
  const { accessToken, user } = useAuth();
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  const queries = useQueries({
    queries: unique.map((id) => ({
      queryKey: ["players", "recent-points", user?.userId, id],
      enabled: accessToken != null,
      staleTime: CALENDAR_STALE_MS,
      retry: false,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.playerLaligaPoints(id), accessToken ?? "", {
          signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        }),
    })),
  });
  return new Map(unique.map((id, index) => [id, recentPointsFrom(queries[index]?.data)]));
}
