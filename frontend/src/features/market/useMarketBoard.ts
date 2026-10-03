import { useEffect, useMemo } from "react";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getJson, paths } from "../../api/client";
import {
  CALENDAR_STALE_MS,
  useCurrentWeekQuery,
  usePlayersCatalogQuery,
  useReauthOnError,
} from "../../api/queries";
import {
  callerTeamId,
  lastPlayedWeek,
  leagueId,
  squadPlayerCountFromTeam,
  teamValueFromPayload,
  weekPointsByMasterId,
} from "../../api/mappers";
import { teamMoneyFromPayload, useTeamMoneyQuery } from "../../api/queries";
import type { CurrentWeek } from "../../api/mappers";
import { useAuth } from "../../auth/AuthProvider";
import { useLeague } from "../lineup/LeagueProvider";
import {
  activeUserBidCount,
  catalogById,
  marketItems,
  marketRow,
  masterIdOf,
  recentFormWeekNumbers,
  userBidsByMarketId,
  valueSeries,
  type MarketRow,
  type ValuePoint,
} from "./marketRows";
import {
  buyoutUnlockByPlayerTeamId,
  sellerTeamIdsForBuyoutLookup,
} from "./model/buyout";
import { applyPendingBids, prunePendingBids, usePendingBids } from "./model/pendingBids";

const HISTORY_STALE_MS = CALENDAR_STALE_MS;

export type MarketBoard = {
  rows: MarketRow[];
  money: number | null;
  callerTeamId: string | null;
  squadPlayerCount: number | null;
  activeBidCount: number | null;
  squadMarketValue: number | null;
  isLoading: boolean;
  hasError: boolean;
  isDegraded: boolean;
  noLeague: boolean;
};

type QueryBatch = {
  data: readonly unknown[];
  errors: readonly unknown[];
  isLoading: boolean;
  isError: boolean;
};

/** Collapses parallel queries into one structurally shared value (stable across renders). */
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
): {
  weekNumbers: readonly number[];
  statsByWeek: Map<number, Map<string, number>>;
  playedThrough: number;
} {
  const statsByWeek = new Map<number, Map<string, number>>();
  weekNumbers.forEach((week, index) => {
    statsByWeek.set(week, weekPointsByMasterId(statsData[index]));
  });
  return { weekNumbers, statsByWeek, playedThrough };
}

/** Loads the league market, joins it with the catalog and value histories. */
export function useMarketBoard(): MarketBoard {
  const { accessToken } = useAuth();
  const { selected, isLoading: leaguesLoading } = useLeague();
  const enabled = accessToken != null && selected != null;
  const token = accessToken ?? "";
  const id = selected ? leagueId(selected) : "";
  const teamId = selected ? callerTeamId(selected) : null;
  const moneyQuery = useTeamMoneyQuery(id, teamId, enabled);

  const teamQuery = useQuery({
    queryKey: ["team", id, teamId],
    enabled: enabled && id !== "" && teamId != null && teamId !== "",
    staleTime: CALENDAR_STALE_MS,
    queryFn: ({ signal }) => getJson(paths.team(id, teamId ?? ""), token, { signal }),
  });

  const marketQuery = useQuery({
    queryKey: ["market", id],
    enabled: enabled && id !== "",
    queryFn: ({ signal }) => getJson(paths.market(id), token, { signal }),
  });
  const pendingBids = usePendingBids(id);
  const market = useMemo(
    () => applyPendingBids(marketQuery.data, pendingBids, Date.now()).snapshot,
    [marketQuery.data, pendingBids],
  );
  useEffect(() => {
    prunePendingBids(id, marketQuery.data);
  }, [id, marketQuery.data, pendingBids]);
  const catalogQuery = usePlayersCatalogQuery(enabled);
  const currentWeekQuery = useCurrentWeekQuery(enabled);

  const playedThrough = useMemo(() => {
    if (currentWeekQuery.data == null) return 0;
    return lastPlayedWeek(currentWeekQuery.data as CurrentWeek);
  }, [currentWeekQuery.data]);

  const formWeekNumbers = useMemo(() => {
    if (playedThrough < 1) return [];
    return recentFormWeekNumbers(playedThrough);
  }, [playedThrough]);

  const items = useMemo(() => marketItems(market), [market]);
  const playerIds = useMemo(
    () => [...new Set(items.map(masterIdOf).filter((value): value is string => value != null))],
    [items],
  );

  const sellerTeamIds = useMemo(
    () => sellerTeamIdsForBuyoutLookup(items, teamId),
    [items, teamId],
  );

  const sellerTeams = useQueries({
    queries: sellerTeamIds.map((sellerTeamId) => ({
      queryKey: ["team", id, sellerTeamId],
      enabled: enabled && id !== "" && sellerTeamId !== "",
      staleTime: CALENDAR_STALE_MS,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.team(id, sellerTeamId), token, { signal }),
    })),
    combine: combineBatch,
  });

  const history = useQueries({
    queries: playerIds.map((playerId) => ({
      queryKey: ["players", "market-value", playerId],
      enabled: enabled && id !== "",
      staleTime: HISTORY_STALE_MS,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.playerMarketValue(playerId), token, { signal }),
    })),
    combine: combineBatch,
  });
  const weekStats = useQueries({
    queries: formWeekNumbers.map((week) => ({
      queryKey: ["calendar", "stats", week],
      enabled: enabled && formWeekNumbers.length > 0,
      staleTime: HISTORY_STALE_MS,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.weekStats(week), token, { signal }),
    })),
    combine: combineBatch,
  });

  const buyoutUnlockByPlayerTeamIdMap = useMemo(
    () => buyoutUnlockByPlayerTeamId(sellerTeams.data),
    [sellerTeams.data],
  );

  useReauthOnError([
    marketQuery.error,
    catalogQuery.error,
    currentWeekQuery.error,
    moneyQuery.error,
    teamQuery.error,
    ...history.errors,
    ...weekStats.errors,
    ...sellerTeams.errors,
  ]);

  const historyReady = playerIds.length === 0 || !history.isLoading;
  const formWeeksReady =
    formWeekNumbers.length === 0 || (currentWeekQuery.isSuccess && !weekStats.isLoading);
  const isLoading =
    leaguesLoading ||
    marketQuery.isLoading ||
    catalogQuery.isLoading ||
    currentWeekQuery.isLoading ||
    teamQuery.isLoading ||
    !historyReady ||
    !formWeeksReady;

  const historyByPlayerId = useMemo(
    () =>
      new Map<string, readonly ValuePoint[]>(
        playerIds.map((playerId, index) => [playerId, valueSeries(history.data[index])]),
      ),
    [playerIds, history.data],
  );

  const calendarForm = useMemo(
    () => calendarFormFromStats(formWeekNumbers, weekStats.data, playedThrough),
    [formWeekNumbers, playedThrough, weekStats.data],
  );

  const userBidsByMarketIdMap = useMemo(
    () => userBidsByMarketId(market),
    [market],
  );

  const rows = useMemo(() => {
    const catalog = catalogById(catalogQuery.data);
    return items.map((item, index) =>
      marketRow(item, index, {
        catalog,
        history: historyByPlayerId,
        calendarForm,
        callerTeamId: teamId,
        userBidsByMarketId: userBidsByMarketIdMap,
        buyoutUnlockByPlayerTeamId: buyoutUnlockByPlayerTeamIdMap,
      }),
    );
  }, [
    items,
    catalogQuery.data,
    historyByPlayerId,
    calendarForm,
    teamId,
    userBidsByMarketIdMap,
    buyoutUnlockByPlayerTeamIdMap,
  ]);

  const money = useMemo(() => {
    const fromApi = teamMoneyFromPayload(moneyQuery.data);
    if (fromApi != null) return fromApi;
    const fallback = selected?.team?.money;
    return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : null;
  }, [moneyQuery.data, selected?.team?.money]);

  const squadPlayerCount = useMemo(
    () => squadPlayerCountFromTeam(teamQuery.data),
    [teamQuery.data],
  );

  const squadMarketValue = useMemo(() => {
    const fromTeam = teamValueFromPayload(teamQuery.data);
    if (fromTeam != null) return fromTeam;
    const fallback = selected?.team?.teamValue;
    return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : null;
  }, [teamQuery.data, selected?.team?.teamValue]);

  const activeBidCount = useMemo(
    () => activeUserBidCount(rows, market),
    [rows, market],
  );

  const hasError = marketQuery.isError || catalogQuery.isError;
  const isDegraded =
    enabled &&
    !isLoading &&
    !hasError &&
    (currentWeekQuery.isError ||
      moneyQuery.isError ||
      teamQuery.isError ||
      history.isError ||
      weekStats.isError ||
      sellerTeams.isError);

  return {
    rows,
    money,
    callerTeamId: teamId,
    squadPlayerCount,
    activeBidCount,
    squadMarketValue,
    isLoading,
    hasError,
    isDegraded,
    noLeague: !leaguesLoading && id === "",
  };
}
