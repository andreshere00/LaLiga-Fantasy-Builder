import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { getJson, paths } from "../../api/client";
import { clubDisplayName, clubMediaFromBadge, clubMediaFromId } from "../../api/clubMedia";
import { asFiniteNumber, asRecord, idText, text, type SquadCard } from "../../api/mappers";
import type { PlayerProfileDto } from "../../api/schemas";
import { CALENDAR_STALE_MS, usePlayersCatalogQuery, useReauthOnError } from "../../api/queries";
import { useAuth } from "../../auth/AuthProvider";
import { availabilityOf, type Availability } from "../market/model/availability";

export type SquadPlayerStats = {
  totalPoints: number | null;
  club: string | null;
  availability: Availability | null;
  outlook: { rating: string | null; starterProbability: number | null; matchweek: number | null } | null;
};

/** Loads profile form and starter likelihood for the given master ids. */
export function usePlayerOutlooks(ids: readonly string[]) {
  const { accessToken, user } = useAuth();
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  const queries = useQueries({
    queries: unique.map((id) => ({
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
  useReauthOnError(queries.map((query) => query.error));
  // Keep the same Map until a requested id or a profile changes, so memos built on it hold.
  const idKey = unique.join("|");
  const dataKey = queries.map((query) => query.dataUpdatedAt).join(",");
  const profiles = useMemo(() => new Map(unique.map((id, index) => [
    id, queries[index]?.data as PlayerProfileDto | undefined,
  ])),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- idKey and dataKey stand for both
  [idKey, dataKey]);
  return {
    profiles,
    isLoading: unique.length > 0 && queries.some((query) => query.isPending),
    errors: queries.map((query) => query.error),
  };
}

/** Loads the whole squad's outlook in parallel so cards can be revealed together. */
export function useSquadStats(players: readonly SquadCard[]) {
  const catalog = usePlayersCatalogQuery(players.length > 0);
  const ids = [...new Set(players.filter((player) => player.positionId !== 5)
    .map((player) => player.masterPlayerId).filter((id): id is string => Boolean(id)))];
  const outlooks = usePlayerOutlooks(ids);
  useReauthOnError([catalog.error, ...outlooks.errors]);
  const catalogById = new Map<string, Record<string, unknown>>();
  for (const entry of Array.isArray(catalog.data) ? catalog.data : []) {
    const record = asRecord(entry);
    const id = idText(record?.id);
    if (id && record) catalogById.set(id, record);
  }
  const profiles = outlooks.profiles;
  const stats = new Map<string, SquadPlayerStats>();
  for (const player of players) {
    const id = player.masterPlayerId;
    if (!id) continue;
    const profile = profiles.get(id);
    const probability = profile?.startProbability?.percent;
    const catalogEntry = catalogById.get(id);
    stats.set(id, {
      totalPoints: player.totalPoints ?? asFiniteNumber(catalogEntry?.points) ?? null,
      club: squadClubName(catalogEntry ?? null, player.teamBadgeUrl),
      availability: squadAvailability(catalogEntry ?? null),
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
    isLoading: players.length > 0 && (catalog.isPending || outlooks.isLoading),
  };
}

function squadClubName(
  catalogEntry: Record<string, unknown> | null,
  badgeUrl: string | null,
): string | null {
  const team = asRecord(catalogEntry?.team);
  const named = clubDisplayName(text(team?.name) ?? text(team?.shortName) ?? undefined)
    ?? text(team?.name);
  if (named) return named;
  const fromId = clubMediaFromId(catalogEntry?.teamId)?.name ?? null;
  if (fromId) return fromId;
  const fromBadge = clubMediaFromBadge(badgeUrl);
  return fromBadge && fromBadge.name !== "Club" ? fromBadge.name : null;
}

function squadAvailability(catalogEntry: Record<string, unknown> | null): Availability | null {
  const status = text(catalogEntry?.playerStatus);
  return status ? availabilityOf(status) : null;
}
