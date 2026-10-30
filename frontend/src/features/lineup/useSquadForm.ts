import { useQueries } from "@tanstack/react-query";
import { getJson, paths } from "../../api/client";
import type { SquadCard } from "../../api/mappers";
import type { PlayerProfileDto } from "../../api/schemas";
import { CALENDAR_STALE_MS, useReauthOnError } from "../../api/queries";
import { useAuth } from "../../auth/AuthProvider";

export type SquadForm = { rating: string | null; loading: boolean };

/** Loads current form only for the footballers on the visible squad page. */
export function useSquadForm(players: readonly SquadCard[]): Map<string, SquadForm> {
  const { accessToken, user } = useAuth();
  const ids = [...new Set(players.filter((player) => player.positionId !== 5)
    .map((player) => player.masterPlayerId).filter((id): id is string => Boolean(id)))];
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["players", "profile", user?.userId, id],
      enabled: accessToken != null,
      staleTime: CALENDAR_STALE_MS,
      retry: false,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.playerStatsProfile(id), accessToken ?? "", { signal }),
    })),
  });
  useReauthOnError(queries.map((query) => query.error));
  return new Map(ids.map((id, index) => {
    const query = queries[index];
    const profile = query.data as PlayerProfileDto | undefined;
    return [id, { rating: profile?.form?.rating ?? null, loading: query.isPending }];
  }));
}
