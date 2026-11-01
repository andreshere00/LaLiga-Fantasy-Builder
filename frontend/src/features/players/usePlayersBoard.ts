import { useMemo } from "react";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";

import { calendarFormContext } from "../market/model/form";
import { getJson, paths } from "../../api/client";
import type { CurrentWeek } from "../../api/mappers";
import { avatarsByTeamId, lastPlayedWeek } from "../../api/mappers";
import {
  CALENDAR_STALE_MS,
  useCurrentWeekQuery,
  usePlayersCatalogQuery,
  useReauthOnError,
} from "../../api/queries";
import { useAuth } from "../../auth/AuthProvider";
import { useLeague } from "../lineup/LeagueProvider";
import { catalogById } from "../market/model/listing";
import { recentFormWeekNumbers } from "../market/marketRows";
import { leagueId } from "../../api/mappers";
import {
  ownerByMasterIdFromRosters,
  playerRowFromCatalog,
  rosterPhotoByMasterId,
  teamIdsFromLeagueTeams,
  type PlayerRow,
} from "./model/playerRow";

const FREE_AGENT = "Free Agent";
const OWNER_PENDING = "…";
const OWNER_UNAVAILABLE = "Unavailable";
const ROSTER_STALE_MS = 5 * 60_000;

type QueryBatch = {
  data: readonly unknown[];
  errors: readonly unknown[];
  isLoading: boolean;
  isError: boolean;
};

function combineBatch(results: readonly UseQueryResult<unknown, Error>[]): QueryBatch {
  return {
    data: results.map((query) => query.data),
    errors: results.map((query) => query.error),
    isLoading: results.some((query) => query.isLoading),
    isError: results.some((query) => query.isError),
  };
}

export type PlayersBoard = {
  rows: PlayerRow[];
  isLoading: boolean;
  hasError: boolean;
  isDegraded: boolean;
  noLeague: boolean;
};

/** Loads the catalog and joins league ownership and calendar form. */
export function usePlayersBoard(): PlayersBoard {
  const { accessToken } = useAuth();
  const { selected, isLoading: leaguesLoading } = useLeague();
  const enabled = accessToken != null && selected != null;
  const token = accessToken ?? "";
  const leagueKey = selected ? leagueId(selected) : "";

  const catalogQuery = usePlayersCatalogQuery(enabled);
  const currentWeekQuery = useCurrentWeekQuery(enabled);
  const leagueTeamsQuery = useQuery({
    queryKey: ["league-teams", leagueKey],
    enabled: enabled && leagueKey !== "",
    staleTime: ROSTER_STALE_MS,
    queryFn: ({ signal }) => getJson(paths.leagueTeams(leagueKey), token, { signal }),
  });

  const teamIds = useMemo(
    () => teamIdsFromLeagueTeams(leagueTeamsQuery.data),
    [leagueTeamsQuery.data],
  );

  const rosterQueries = useQueries({
    queries: teamIds.map((teamId) => ({
      queryKey: ["team", leagueKey, teamId],
      enabled: enabled && leagueKey !== "" && teamId !== "",
      staleTime: ROSTER_STALE_MS,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.team(leagueKey, teamId), token, { signal }),
    })),
    combine: combineBatch,
  });

  const playedThrough = useMemo(() => {
    if (currentWeekQuery.data == null) return 0;
    return lastPlayedWeek(currentWeekQuery.data as CurrentWeek);
  }, [currentWeekQuery.data]);

  const currentWeek = (currentWeekQuery.data as CurrentWeek | undefined)?.weekNumber ?? 0;
  const formWeekNumbers = useMemo(
    () => recentFormWeekNumbers(currentWeek),
    [currentWeek],
  );

  const weekStats = useQueries({
    queries: formWeekNumbers.map((week) => ({
      queryKey: ["calendar", "stats", week],
      enabled: enabled && formWeekNumbers.length > 0,
      staleTime: week === currentWeek ? 30_000 : CALENDAR_STALE_MS,
      refetchInterval: week === currentWeek ? 30_000 : false,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.weekStats(week), token, { signal }),
    })),
    combine: combineBatch,
  });

  useReauthOnError([
    catalogQuery.error,
    currentWeekQuery.error,
    leagueTeamsQuery.error,
    ...rosterQueries.errors,
    ...weekStats.errors,
  ]);

  const ownership = useMemo(() => {
    return ownerByMasterIdFromRosters([
      ...(Array.isArray(leagueTeamsQuery.data) ? leagueTeamsQuery.data : []),
      ...rosterQueries.data,
    ]);
  }, [leagueTeamsQuery.data, rosterQueries.data]);

  const calendarForm = useMemo(
    () => calendarFormContext(formWeekNumbers, weekStats.data, playedThrough, currentWeek),
    [formWeekNumbers, playedThrough, currentWeek, weekStats.data],
  );

  const rosterPhotos = useMemo(
    () => rosterPhotoByMasterId(rosterQueries.data),
    [rosterQueries.data],
  );

  const ownershipPending =
    enabled &&
    leagueKey !== "" &&
    (leagueTeamsQuery.isLoading || (teamIds.length > 0 && rosterQueries.isLoading));
  const ownershipComplete =
    enabled &&
    leagueKey !== "" &&
    !leagueTeamsQuery.isLoading &&
    !leagueTeamsQuery.isError &&
    !rosterQueries.isLoading &&
    !rosterQueries.isError;

  const ownerAvatars = useMemo(() => avatarsByTeamId([
    ...(Array.isArray(leagueTeamsQuery.data) ? leagueTeamsQuery.data : []),
    ...rosterQueries.data,
  ]), [leagueTeamsQuery.data, rosterQueries.data]);

  const rows = useMemo(() => {
    const catalog = catalogById(catalogQuery.data);
    const list: PlayerRow[] = [];
    for (const [playerId, master] of catalog) {
      const owner = ownership.get(playerId);
      const ownedBy = owner ? owner.name ?? "Unknown manager" : (
        ownershipPending ? OWNER_PENDING : ownershipComplete ? FREE_AGENT : OWNER_UNAVAILABLE
      );
      const row = playerRowFromCatalog(master, playerId, ownedBy, owner?.teamId ?? null,
        calendarForm, owner ?? null);
      const fromRoster = rosterPhotos.get(playerId) ?? null;
      list.push({
        ...row,
        ownerAvatarUrl: owner ? ownerAvatars.get(owner.teamId) ?? null : null,
        photoUrl: row.photoUrl ?? fromRoster,
        photoFallbackUrl: row.photoUrl ? fromRoster : null,
      });
    }
    list.sort((left, right) => (right.points ?? -1) - (left.points ?? -1));
    return list;
  }, [catalogQuery.data, ownership, ownershipComplete, ownershipPending, calendarForm, rosterPhotos, ownerAvatars]);

  const isLoading = leaguesLoading || catalogQuery.isLoading;

  const hasError = catalogQuery.isError && catalogQuery.data == null;
  const isDegraded =
    enabled &&
    !isLoading &&
    !hasError &&
    (catalogQuery.isError ||
      currentWeekQuery.isError ||
      leagueTeamsQuery.isError ||
      rosterQueries.isError ||
      weekStats.isError);

  return {
    rows,
    isLoading,
    hasError,
    isDegraded,
    noLeague: !leaguesLoading && leagueKey === "",
  };
}
