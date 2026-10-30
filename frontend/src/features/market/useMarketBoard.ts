import { useEffect, useMemo } from "react";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";

import { calendarFormContext } from "./model/form";
import { getJson, paths } from "../../api/client";
import {
  CALENDAR_STALE_MS,
  useCurrentWeekQuery,
  usePlayersCatalogQuery,
  useReauthOnError,
} from "../../api/queries";
import {
  avatarsByTeamId,
  callerTeamId,
  captainIdOf,
  catalogMediaByMasterId,
  lastPlayedWeek,
  leagueId,
  idText,
  playersOf,
  squadCards,
  squadPlayerCountFromTeam,
  teamValueFromPayload,
} from "../../api/mappers";
import { teamMoneyFromPayload, useTeamMoneyQuery } from "../../api/queries";
import type { CurrentWeek } from "../../api/mappers";
import type { SquadCard } from "../../api/mappers";
import { useAuth } from "../../auth/AuthProvider";
import { useNow } from "../../hooks/useNow";
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
import {
  buyoutUnlockByPlayerTeamId,
  sellerTeamIdsForBuyoutLookup,
} from "./model/buyout";
import { applyPendingBids, prunePendingBids, usePendingBids } from "./model/pendingBids";
import { normalizeActiveBids, projectBids, type ActiveBids, type BidProjection } from "./model/activeBids";

const HISTORY_STALE_MS = CALENDAR_STALE_MS;

export type MarketBoard = {
  rows: MarketRow[];
  ownSquadCards: SquadCard[];
  ownSquadAvailable: boolean;
  money: number | null;
  callerTeamId: string | null;
  squadPlayerCount: number | null;
  activeBidCount: number | null;
  activeBids: ActiveBids;
  projection: BidProjection;
  bidsLoading: boolean;
  bidsError: boolean;
  projectionRefreshing: boolean;
  projectionStale: boolean;
  refreshBids: () => void;
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

/** Loads the league market, joins it with the catalog and value histories. */
export function useMarketBoard(): MarketBoard {
  const { accessToken } = useAuth();
  const { selected, isLoading: leaguesLoading } = useLeague();
  const enabled = accessToken != null && selected != null;
  const token = accessToken ?? "";
  const id = selected ? leagueId(selected) : "";
  const teamId = selected ? callerTeamId(selected) : null;
  const now = useNow();
  const moneyQuery = useTeamMoneyQuery(id, teamId, enabled);

  const leagueTeamsQuery = useQuery({
    queryKey: ["league-teams", id],
    enabled: enabled && id !== "",
    staleTime: CALENDAR_STALE_MS,
    queryFn: ({ signal }) => getJson(paths.leagueTeams(id), token, { signal }),
  });

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

  const currentWeek = (currentWeekQuery.data as CurrentWeek | undefined)?.weekNumber ?? 0;
  const formWeekNumbers = useMemo(
    () => recentFormWeekNumbers(currentWeek),
    [currentWeek],
  );

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
      staleTime: week === currentWeek ? 30_000 : HISTORY_STALE_MS,
      refetchInterval: week === currentWeek ? 30_000 : false,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.weekStats(week), token, { signal }),
    })),
    combine: combineBatch,
  });

  const buyoutUnlockByPlayerTeamIdMap = useMemo(
    () => buyoutUnlockByPlayerTeamId([teamQuery.data, ...sellerTeams.data]),
    [teamQuery.data, sellerTeams.data],
  );

  useReauthOnError([
    leagueTeamsQuery.error,
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
    () => calendarFormContext(formWeekNumbers, weekStats.data, playedThrough, currentWeek),
    [formWeekNumbers, playedThrough, currentWeek, weekStats.data],
  );

  const activeBids = useMemo(
    () => {
      const active = normalizeActiveBids(market, catalogQuery.data, now);
      return { ...active, bids: active.bids.map((bid) => bid.marketId && pendingBids.has(bid.marketId)
        ? { ...bid, confirmed: false, actionRow: null } : bid) };
    },
    [market, catalogQuery.data, now, pendingBids],
  );

  const sellerAvatars = useMemo(() => avatarsByTeamId([
    ...(Array.isArray(leagueTeamsQuery.data) ? leagueTeamsQuery.data : []),
    selected?.team, teamQuery.data, ...sellerTeams.data,
  ]), [leagueTeamsQuery.data, selected?.team, teamQuery.data, sellerTeams.data]);

  const rows = useMemo(() => {
    const catalog = catalogById(catalogQuery.data);
    return items.map((item, index) => {
      const row = marketRow(item, index, {
        catalog,
        history: historyByPlayerId,
        calendarForm,
        callerTeamId: teamId,
        buyoutUnlockByPlayerTeamId: buyoutUnlockByPlayerTeamIdMap,
      });
      const bid = activeBids.bids.find((entry) => entry.marketId === row.marketId);
      return { ...row,
        sellerAvatarUrl: row.sellerAvatarUrl
          ?? (row.sellerTeamId ? sellerAvatars.get(row.sellerTeamId) : null),
        myBid: bid?.id && bid.money != null ? { id: bid.id, money: bid.money } : null,
        bidActionsAvailable: idText(item.id) != null && !pendingBids.has(row.marketId)
          && (!bid || bid.actionRow != null) };
    });
  }, [
    items,
    catalogQuery.data,
    historyByPlayerId,
    calendarForm,
    teamId,
    activeBids,
    pendingBids,
    buyoutUnlockByPlayerTeamIdMap,
    sellerAvatars,
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
  const ownSquadCards = useMemo(
    () =>
      squadCards(
        playersOf(teamQuery.data),
        captainIdOf(teamQuery.data),
        catalogMediaByMasterId(catalogQuery.data),
      ),
    [catalogQuery.data, teamQuery.data],
  );

  const squadMarketValue = useMemo(() => {
    const fromTeam = teamValueFromPayload(teamQuery.data);
    if (fromTeam != null) return fromTeam;
    const fallback = selected?.team?.teamValue;
    return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : null;
  }, [teamQuery.data, selected?.team?.teamValue]);

  const activeBidCount = marketQuery.data != null && activeBids.complete
    ? activeBids.bids.length : null;
  const projection = projectBids(money, activeBids);

  const hasError = (marketQuery.isError && marketQuery.data == null)
    || (catalogQuery.isError && catalogQuery.data == null);
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
    ownSquadCards,
    ownSquadAvailable: teamQuery.isSuccess,
    money,
    callerTeamId: teamId,
    squadPlayerCount,
    activeBidCount,
    activeBids,
    projection,
    bidsLoading: marketQuery.isLoading,
    bidsError: marketQuery.isError,
    projectionRefreshing: marketQuery.isFetching || moneyQuery.isFetching || pendingBids.size > 0,
    projectionStale: marketQuery.isError || moneyQuery.isError,
    refreshBids: () => {
      void marketQuery.refetch();
      void moneyQuery.refetch();
      if (catalogQuery.isError) void catalogQuery.refetch();
    },
    squadMarketValue,
    isLoading,
    hasError,
    isDegraded,
    noLeague: !leaguesLoading && id === "",
  };
}
