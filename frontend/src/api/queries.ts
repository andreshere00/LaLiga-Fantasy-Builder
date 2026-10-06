import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { getJson, paths, type PlayerStatsDetailQuery } from "./client";
import type { MasterPlayerId } from "./ids";
import { masterPlayerIdToString } from "./ids";
import { NeedsReauthError } from "./errors";
import { asCurrentWeek, asFiniteNumber, asRecord } from "./mappers";
import { useAuth } from "../auth/AuthProvider";

export const CATALOG_STALE_MS = 60 * 60 * 1000;
export const CALENDAR_STALE_MS = 5 * 60_000;

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
  playerId: MasterPlayerId | string | null,
  query: PlayerStatsDetailQuery,
  enabled: boolean,
) {
  const { accessToken } = useAuth();
  const token = accessToken ?? "";
  const id = playerId == null ? "" : typeof playerId === "string" ? playerId : masterPlayerIdToString(playerId);
  return useQuery({
    queryKey: ["players", "detail", id, query],
    enabled: enabled && accessToken != null && id !== "",
    staleTime: CALENDAR_STALE_MS,
    queryFn: ({ signal }) =>
      getJson(paths.playerStatsDetail(id, query), token, { signal }),
  });
}
