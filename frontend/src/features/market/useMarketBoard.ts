import { useEffect, useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { getJson, paths } from "../../api/client";
import { NeedsReauthError } from "../../api/errors";
import { defaultWeek, leagueId, weekPointsByMasterId } from "../../api/mappers";
import type { CurrentWeek } from "../../api/mappers";
import { useAuth } from "../../auth/AuthProvider";
import { useLeague } from "../lineup/LeagueProvider";
import {
  catalogById,
  marketItems,
  marketRow,
  masterIdOf,
  recentFormWeekNumbers,
  valueSeries,
  type MarketRow,
  type ValuePoint,
} from "./marketRows";

const HISTORY_STALE_MS = 5 * 60_000;

export type MarketBoard = {
  rows: MarketRow[];
  isLoading: boolean;
  hasError: boolean;
  noLeague: boolean;
};

/** Loads the league market, joins it with the catalog and value histories. */
export function useMarketBoard(): MarketBoard {
  const { accessToken, markNeedsReauth } = useAuth();
  const { selected, isLoading: leaguesLoading } = useLeague();
  const token = accessToken ?? "";
  const id = selected ? leagueId(selected) : "";

  const marketQuery = useQuery({
    queryKey: ["market", id],
    enabled: token !== "" && id !== "",
    queryFn: ({ signal }) => getJson(paths.market(id), token, { signal }),
  });
  const catalogQuery = useQuery({
    queryKey: ["players", "catalog"],
    enabled: token !== "",
    queryFn: ({ signal }) => getJson(paths.playersCatalog(), token, { signal }),
  });
  const currentWeekQuery = useQuery({
    queryKey: ["calendar", "current"],
    enabled: token !== "",
    staleTime: HISTORY_STALE_MS,
    queryFn: ({ signal }) => getJson(paths.currentWeek(), token, { signal }),
  });

  const formWeekNumbers = useMemo(() => {
    if (currentWeekQuery.data == null) return [];
    return recentFormWeekNumbers(defaultWeek(currentWeekQuery.data as CurrentWeek));
  }, [currentWeekQuery.data]);

  const items = useMemo(() => marketItems(marketQuery.data), [marketQuery.data]);
  const playerIds = useMemo(
    () => [...new Set(items.map(masterIdOf).filter((value): value is string => value != null))],
    [items],
  );

  const historyQueries = useQueries({
    queries: playerIds.map((playerId) => ({
      queryKey: ["players", "market-value", playerId],
      staleTime: HISTORY_STALE_MS,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.playerMarketValue(playerId), token, { signal }),
    })),
  });
  const weekStatsQueries = useQueries({
    queries: formWeekNumbers.map((week) => ({
      queryKey: ["calendar", "stats", week],
      enabled: token !== "" && formWeekNumbers.length > 0,
      staleTime: HISTORY_STALE_MS,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.weekStats(week), token, { signal }),
    })),
  });

  const errors = [
    marketQuery.error,
    catalogQuery.error,
    currentWeekQuery.error,
    ...historyQueries.map((q) => q.error),
    ...weekStatsQueries.map((q) => q.error),
  ];
  const reauth = errors.some((error) => error instanceof NeedsReauthError);
  useEffect(() => {
    if (reauth) markNeedsReauth();
  }, [reauth, markNeedsReauth]);

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
    !historyReady ||
    !formWeeksReady;

  const calendarForm = useMemo(() => {
    const statsByWeek = new Map<number, Map<string, number>>();
    formWeekNumbers.forEach((week, index) => {
      statsByWeek.set(week, weekPointsByMasterId(weekStatsQueries[index]?.data));
    });
    return { weekNumbers: formWeekNumbers, statsByWeek };
  }, [formWeekNumbers, weekStatsQueries]);

  const rows = useMemo(() => {
    const catalog = catalogById(catalogQuery.data);
    const history = new Map<string, readonly ValuePoint[]>(
      playerIds.map((playerId, index) => [playerId, valueSeries(historyQueries[index]?.data)]),
    );
    return items.map((item, index) =>
      marketRow(item, index, catalog, history, new Map(), calendarForm),
    );
  }, [items, catalogQuery.data, playerIds, historyQueries, calendarForm]);

  return {
    rows,
    isLoading,
    hasError: marketQuery.isError || catalogQuery.isError,
    noLeague: !leaguesLoading && id === "",
  };
}
