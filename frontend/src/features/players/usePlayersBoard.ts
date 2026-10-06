import { useMemo } from "react";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getJson, paths } from "../../api/client";
import type { CurrentWeek } from "../../api/mappers";
import { lastPlayedWeek } from "../../api/mappers";
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
import { weekPointsByMasterId } from "../../api/mappers";
import {
  ownerByMasterIdFromRosters,
  playerRowFromCatalog,
  rosterPhotoByMasterId,
  teamIdsFromLeagueTeams,
  type PlayerRow,
} from "./model/playerRow";

const FREE_AGENT = "Free Agent";
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

function calendarFormFromStats(
  weekNumbers: readonly number[],
  statsData: readonly unknown[],
  playedThrough: number,
) {
  const statsByWeek = new Map<number, Map<string, number>>();
  weekNumbers.forEach((week, index) => {
    statsByWeek.set(week, weekPointsByMasterId(statsData[index]));
  });
  return { weekNumbers, statsByWeek, playedThrough };
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

  const formWeekNumbers = useMemo(() => {
    if (playedThrough < 1) return [];
    return recentFormWeekNumbers(playedThrough);
  }, [playedThrough]);

  const weekStats = useQueries({
    queries: formWeekNumbers.map((week) => ({
      queryKey: ["calendar", "stats", week],
      enabled: enabled && formWeekNumbers.length > 0,
      staleTime: CALENDAR_STALE_MS,
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
    const fromList = ownerByMasterIdFromRosters(
      Array.isArray(leagueTeamsQuery.data) ? leagueTeamsQuery.data : [],
    );
    const fromRosters = ownerByMasterIdFromRosters(rosterQueries.data);
    return new Map([...fromList, ...fromRosters]);
  }, [leagueTeamsQuery.data, rosterQueries.data]);

  const calendarForm = useMemo(
    () => calendarFormFromStats(formWeekNumbers, weekStats.data, playedThrough),
    [formWeekNumbers, playedThrough, weekStats.data],
  );

  const rosterPhotos = useMemo(
    () => rosterPhotoByMasterId(rosterQueries.data),
    [rosterQueries.data],
  );

  const rows = useMemo(() => {
    const catalog = catalogById(catalogQuery.data);
    const list: PlayerRow[] = [];
    for (const [playerId, master] of catalog) {
      const ownedBy = ownership.get(playerId) ?? FREE_AGENT;
      const row = playerRowFromCatalog(master, playerId, ownedBy, calendarForm);
      if (!row.photoUrl) {
        const fromRoster = rosterPhotos.get(playerId);
        if (fromRoster) list.push({ ...row, photoUrl: fromRoster });
        else list.push(row);
      } else {
        list.push(row);
      }
    }
    list.sort((left, right) => (right.points ?? -1) - (left.points ?? -1));
    return list;
  }, [catalogQuery.data, ownership, calendarForm, rosterPhotos]);

  const formWeeksReady =
    formWeekNumbers.length === 0 || (currentWeekQuery.isSuccess && !weekStats.isLoading);
  const rostersReady = teamIds.length === 0 || !rosterQueries.isLoading;
  const isLoading =
    leaguesLoading ||
    catalogQuery.isLoading ||
    currentWeekQuery.isLoading ||
    leagueTeamsQuery.isLoading ||
    !formWeeksReady ||
    !rostersReady;

  const hasError = catalogQuery.isError;
  const isDegraded =
    enabled &&
    !isLoading &&
    !hasError &&
    (currentWeekQuery.isError || leagueTeamsQuery.isError || rosterQueries.isError || weekStats.isError);

  return {
    rows,
    isLoading,
    hasError,
    isDegraded,
    noLeague: !leaguesLoading && leagueKey === "",
  };
}
