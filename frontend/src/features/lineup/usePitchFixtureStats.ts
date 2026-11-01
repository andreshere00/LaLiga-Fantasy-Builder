import { useQueries } from "@tanstack/react-query";

import { getJson, paths } from "../../api/client";
import { CALENDAR_STALE_MS, useReauthOnError } from "../../api/queries";
import type { PlayerFixtureStatsDto } from "../../api/schemas";
import { useAuth } from "../../auth/AuthProvider";

/** Loads LaLiga fixture statistics for the players currently on the pitch. */
export function usePitchFixtureStats(playerIds: readonly string[], enabled: boolean) {
  const { accessToken, user } = useAuth();
  const ids = [...new Set(playerIds.filter((id) => id.length > 0))].sort();
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["players", "fixtures", user?.userId, id, "laliga"],
      enabled: enabled && accessToken != null,
      staleTime: CALENDAR_STALE_MS,
      retry: false,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.playerStatsFixtures(id), accessToken ?? "", { signal }),
    })),
  });
  useReauthOnError(queries.map((query) => query.error));
  const stats = new Map<string, PlayerFixtureStatsDto>();
  ids.forEach((id, index) => {
    const data = queries[index]?.data;
    if (data) stats.set(id, data as PlayerFixtureStatsDto);
  });
  return stats;
}
