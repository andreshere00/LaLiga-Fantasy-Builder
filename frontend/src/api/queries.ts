import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { getJson, paths, type PlayerStatsDetailQuery } from "./client";
import { NeedsReauthError } from "./errors";
import { asCurrentWeek, asFiniteNumber, asRecord } from "./mappers";
import { useAuth } from "../auth/AuthProvider";

export const CATALOG_STALE_MS = 60 * 60 * 1000;
export const CALENDAR_STALE_MS = 5 * 60_000;
export const STANDINGS_CACHE_MS = 60 * 60_000;

/** Keep standings fresh and retained for at least one hour of the signed-in session. */
export function useCompetitionStandingsQuery(
  competitionId = 1, season?: number, enabled = true,
) {
  const { accessToken, user } = useAuth();
  const userId = user?.userId ?? null;
  return useQuery({
    queryKey: ["competition-standings", userId, competitionId, season ?? "current", "completed"],
    enabled: enabled && accessToken != null && userId != null,
    staleTime: STANDINGS_CACHE_MS,
    gcTime: STANDINGS_CACHE_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: false,
    queryFn: ({ signal }) => getJson(
      paths.competitionStandings(competitionId, season), accessToken ?? "", { signal },
    ),
  });
}

export function useReauthOnError(errors: readonly unknown[]): void {
  const { markNeedsReauth } = useAuth();
  const reauth = errors.some((error) => error instanceof NeedsReauthError);
  useEffect(() => {
    if (reauth) markNeedsReauth();
  }, [reauth, markNeedsReauth]);
}

export function useCurrentWeekQuery(enabled: boolean) {
  const { accessToken } = useAuth();
  const token = accessToken ?? "";
  return useQuery({
    queryKey: ["calendar", "current"],
    enabled: enabled && accessToken != null,
    staleTime: CALENDAR_STALE_MS,
    refetchInterval: 30_000,
    queryFn: ({ signal }) => getJson(paths.currentWeek(), token, { signal }),
  });
}

export function usePlayersCatalogQuery(enabled: boolean, staleTime = CATALOG_STALE_MS) {
  const { accessToken } = useAuth();
  const token = accessToken ?? "";
  return useQuery({
    queryKey: ["players", "catalog"],
    enabled: enabled && accessToken != null,
    staleTime,
    queryFn: ({ signal }) => getJson(paths.playersCatalog(), token, { signal }),
  });
}

export function useTeamMoneyQuery(leagueId: string, teamId: string | null, enabled: boolean) {
  const { accessToken } = useAuth();
  const token = accessToken ?? "";
  return useQuery({
    queryKey: ["team-money", leagueId, teamId],
    enabled: enabled && accessToken != null && teamId != null && teamId !== "",
    staleTime: CALENDAR_STALE_MS,
    queryFn: ({ signal }) => getJson(paths.teamMoney(teamId ?? ""), token, { signal }),
  });
}

/** Parses `GET /teams/{id}/money` teamMoney field. */
export function teamMoneyFromPayload(data: unknown): number | null {
  const record = asRecord(data);
  return asFiniteNumber(record?.teamMoney);
}

export function useCurrentWeekData(query: ReturnType<typeof useCurrentWeekQuery>) {
  return asCurrentWeek(query.data);
}

export function usePlayerStatsDetailQuery(
  playerId: string | null,
  query: PlayerStatsDetailQuery,
  enabled: boolean,
) {
  const { accessToken } = useAuth();
  const token = accessToken ?? "";
  const id = playerId ?? "";
  return useQuery({
    queryKey: ["players", "detail", id, query],
    enabled: enabled && accessToken != null && id !== "",
    staleTime: CALENDAR_STALE_MS,
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery?.queryKey[2] !== id) return undefined;
      return previousData;
    },
    queryFn: ({ signal }) =>
      getJson(paths.playerStatsDetail(id, query), token, { signal }),
  });
}
