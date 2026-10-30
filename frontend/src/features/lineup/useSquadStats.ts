import { useQueries } from "@tanstack/react-query";
import { getJson, paths } from "../../api/client";
import { asFiniteNumber, asRecord, idText, type SquadCard } from "../../api/mappers";
import type { PlayerProfileDto } from "../../api/schemas";
import { CALENDAR_STALE_MS, usePlayersCatalogQuery, useReauthOnError } from "../../api/queries";
import { useAuth } from "../../auth/AuthProvider";

export type SquadPlayerStats = {
  totalPoints: number | null;
  outlook: { rating: string | null; starterProbability: number | null; matchweek: number | null } | null;
};

/** Loads the whole squad's outlook in parallel so cards can be revealed together. */
export function useSquadStats(players: readonly SquadCard[]) {
  const { accessToken, user } = useAuth();
  const catalog = usePlayersCatalogQuery(players.length > 0);
  const ids = [...new Set(players.filter((player) => player.positionId !== 5)
    .map((player) => player.masterPlayerId).filter((id): id is string => Boolean(id)))];
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["players", "profile", user?.userId, id],
      enabled: accessToken != null,
      staleTime: CALENDAR_STALE_MS,
      retry: false,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.playerStatsProfile(id), accessToken ?? "", {
          signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        }),
    })),
  });
  useReauthOnError([catalog.error, ...queries.map((query) => query.error)]);
  const catalogPoints = new Map<string, number | null>();
  for (const entry of Array.isArray(catalog.data) ? catalog.data : []) {
    const record = asRecord(entry);
    const id = idText(record?.id);
    if (id) catalogPoints.set(id, asFiniteNumber(record?.points));
  }
  const profiles = new Map(ids.map((id, index) => [
    id, queries[index].data as PlayerProfileDto | undefined,
  ]));
  const stats = new Map<string, SquadPlayerStats>();
  for (const player of players) {
    const id = player.masterPlayerId;
    if (!id) continue;
    const profile = profiles.get(id);
    const probability = profile?.startProbability?.percent;
    stats.set(id, {
      totalPoints: player.totalPoints ?? catalogPoints.get(id) ?? null,
      outlook: player.positionId === 5 ? null : {
        rating: profile?.form?.rating ?? null,
        starterProbability: typeof probability === "number" && probability >= 0 && probability <= 100
          ? probability : null,
        matchweek: profile?.startProbability?.matchweek ?? null,
      },
    });
  }
  return {
    stats,
    isLoading: players.length > 0 && (catalog.isPending || queries.some((query) => query.isPending)),
  };
}
