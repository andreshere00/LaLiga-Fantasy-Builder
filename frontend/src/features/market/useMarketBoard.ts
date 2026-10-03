import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

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

function calendarFormFromStats(
  weekNumbers: readonly number[],
  statsResponses: readonly { data: unknown }[],
  playedThrough: number,
): {
  weekNumbers: readonly number[];
  statsByWeek: Map<number, Map<string, number>>;
  playedThrough: number;
} {
  const statsByWeek = new Map<number, Map<string, number>>();
  weekNumbers.forEach((week, index) => {
    statsByWeek.set(week, weekPointsByMasterId(statsResponses[index]?.data));
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

  const items = useMemo(() => marketItems(marketQuery.data), [marketQuery.data]);
  const playerIds = useMemo(
    () => [...new Set(items.map(masterIdOf).filter((value): value is string => value != null))],
    [items],
  );

  const historyQueries = useQueries({
    queries: playerIds.map((playerId) => ({
      queryKey: ["players", "market-value", playerId],
      enabled: enabled && id !== "",
      staleTime: HISTORY_STALE_MS,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.playerMarketValue(playerId), token, { signal }),
    })),
  });
  const weekStatsQueries = useQueries({
    queries: formWeekNumbers.map((week) => ({
      queryKey: ["calendar", "stats", week],
      enabled: enabled && formWeekNumbers.length > 0,
      staleTime: HISTORY_STALE_MS,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.weekStats(week), token, { signal }),
    })),
  });

  const historyData = historyQueries.map((query) => query.data);
  const weekStatsData = weekStatsQueries.map((query) => query.data);

  const errors = [
    marketQuery.error,
    catalogQuery.error,
    currentWeekQuery.error,
    moneyQuery.error,
    teamQuery.error,
    ...historyQueries.map((q) => q.error),
    ...weekStatsQueries.map((q) => q.error),
  ];
  useReauthOnError(errors);

  const historyReady =
    playerIds.length === 0 || historyQueries.every((query) => !query.isLoading);
  const formWeeksReady =
    formWeekNumbers.length === 0 ||
    (currentWeekQuery.isSuccess &&
      weekStatsQueries.every((query) => !query.isLoading));
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
        playerIds.map((playerId, index) => [playerId, valueSeries(historyData[index])]),
      ),
    [playerIds, ...historyData],
  );

  const calendarForm = useMemo(
    () =>
      calendarFormFromStats(
        formWeekNumbers,
        weekStatsData.map((data) => ({ data })),
        playedThrough,
      ),
    [formWeekNumbers, playedThrough, ...weekStatsData],
  );

  const userBidsByMarketIdMap = useMemo(
    () => userBidsByMarketId(marketQuery.data),
    [marketQuery.data],
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
      }),
    );
  }, [items, catalogQuery.data, historyByPlayerId, calendarForm, teamId, userBidsByMarketIdMap]);

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
    () => activeUserBidCount(rows, marketQuery.data),
    [rows, marketQuery.data],
  );

  const hasError = marketQuery.isError || catalogQuery.isError;
  const isDegraded =
    enabled &&
    !isLoading &&
    !hasError &&
    (currentWeekQuery.isError ||
      historyQueries.some((query) => query.isError) ||
      weekStatsQueries.some((query) => query.isError));

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
