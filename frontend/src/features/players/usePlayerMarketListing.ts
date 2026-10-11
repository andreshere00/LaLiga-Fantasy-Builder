import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getJson, paths } from "../../api/client";
import {
  callerTeamId,
  leagueId,
  squadPlayerCountFromTeam,
  teamValueFromPayload,
} from "../../api/mappers";
import {
  CALENDAR_STALE_MS,
  teamMoneyFromPayload,
  usePlayersCatalogQuery,
  useReauthOnError,
  useTeamMoneyQuery,
} from "../../api/queries";
import { useAuth } from "../../auth/AuthProvider";
import { useLeague } from "../lineup/LeagueProvider";
import {
  activeUserBidCount,
  catalogById,
  marketItems,
  userBidsByMarketId,
} from "../market/model/listing";
import { applyPendingBids, prunePendingBids, usePendingBids } from "../market/model/pendingBids";
import { marketRow, type MarketRow } from "../market/model/row";
import type { ValuePoint } from "../market/model/valueSeries";

const EMPTY_HISTORY: ReadonlyMap<string, readonly ValuePoint[]> = new Map();

export type PlayerMarketListing = {
  row: MarketRow | null;
  money: number | null;
  callerTeamId: string | null;
  squadPlayerCount: number | null;
  activeBidCount: number | null;
  squadMarketValue: number | null;
};

/** Market listing and squad totals for one player, without value history or week stats. */
export function usePlayerMarketListing(masterId: string | null): PlayerMarketListing {
  const { accessToken } = useAuth();
  const { selected } = useLeague();
  const enabled = accessToken != null && selected != null && masterId != null;
  const token = accessToken ?? "";
  const leagueKey = selected ? leagueId(selected) : "";
  const teamId = selected ? callerTeamId(selected) : null;

  const moneyQuery = useTeamMoneyQuery(leagueKey, teamId, enabled);
  const teamQuery = useQuery({
    queryKey: ["team", leagueKey, teamId],
    enabled: enabled && leagueKey !== "" && teamId != null && teamId !== "",
    staleTime: CALENDAR_STALE_MS,
    queryFn: ({ signal }) => getJson(paths.team(leagueKey, teamId ?? ""), token, { signal }),
  });
  const marketQuery = useQuery({
    queryKey: ["market", leagueKey],
    enabled: enabled && leagueKey !== "",
    queryFn: ({ signal }) => getJson(paths.market(leagueKey), token, { signal }),
  });
  const catalogQuery = usePlayersCatalogQuery(enabled);
  const pendingBids = usePendingBids(leagueKey);
  const market = useMemo(
    () => applyPendingBids(marketQuery.data, pendingBids, Date.now()).snapshot,
    [marketQuery.data, pendingBids],
  );

  useEffect(() => {
    prunePendingBids(leagueKey, marketQuery.data);
  }, [leagueKey, marketQuery.data, pendingBids]);

  useReauthOnError([moneyQuery.error, teamQuery.error, marketQuery.error, catalogQuery.error]);

  const rows = useMemo(() => {
    const catalog = catalogById(catalogQuery.data);
    const bids = userBidsByMarketId(market);
    return marketItems(market).map((item, index) =>
      marketRow(item, index, {
        catalog,
        history: EMPTY_HISTORY,
        callerTeamId: teamId,
        userBidsByMarketId: bids,
      }),
    );
  }, [catalogQuery.data, market, teamId]);

  const row = useMemo(
    () => (masterId == null ? null : (rows.find((entry) => entry.playerId === masterId) ?? null)),
    [masterId, rows],
  );

  const money = useMemo(() => {
    const fromApi = teamMoneyFromPayload(moneyQuery.data);
    if (fromApi != null) return fromApi;
    const fallback = selected?.team?.money;
    return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : null;
  }, [moneyQuery.data, selected?.team?.money]);

  const squadMarketValue = useMemo(() => {
    const fromTeam = teamValueFromPayload(teamQuery.data);
    if (fromTeam != null) return fromTeam;
    const fallback = selected?.team?.teamValue;
    return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : null;
  }, [selected?.team?.teamValue, teamQuery.data]);

  const activeBidCount = useMemo(() => activeUserBidCount(rows, market), [market, rows]);

  return {
    row,
    money,
    callerTeamId: teamId,
    squadPlayerCount: squadPlayerCountFromTeam(teamQuery.data),
    activeBidCount,
    squadMarketValue,
  };
}
