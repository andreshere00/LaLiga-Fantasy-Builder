import { useQueryClient, type FetchQueryOptions, type QueryKey } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  clubIndexOptions, leagueTeamsOptions, marketOptions, playersCatalogOptions,
} from "../api/queries";
import { leagueId } from "../api/mappers";
import { useAuth } from "../auth/AuthProvider";
import { useLeague } from "../features/lineup/LeagueProvider";
import { preloadRoute, routeForPath, warmOnIntent, type PreloadableRoute } from "./routeModules";

/**
 * Warms what a section needs before the click: its code chunk and the first data requests.
 * Only read endpoints are prefetched; nothing here writes.
 */
export function useRoutePrefetch() {
  const queryClient = useQueryClient();
  const { accessToken, user } = useAuth();
  const { selected } = useLeague();
  const token = accessToken ?? "";
  const league = selected ? leagueId(selected) : "";

  const prefetchData = useCallback((route: PreloadableRoute) => {
    if (token === "") return;
    const warm = <T, K extends QueryKey>(options: FetchQueryOptions<T, Error, T, K>) =>
      void queryClient.prefetchQuery(options).catch(() => undefined);
    if (route === "/market" && league !== "") {
      warm(marketOptions(league, token));
      warm(leagueTeamsOptions(league, token));
    } else if (route === "/players") {
      warm(playersCatalogOptions(token));
      if (league !== "") warm(leagueTeamsOptions(league, token));
    } else if (route === "/teams") {
      warm(clubIndexOptions(user?.userId ?? null, token));
    }
  }, [league, queryClient, token, user?.userId]);

  /** Event props for a link: warms on hover, keyboard focus and first touch. */
  return useCallback((path: string) => {
    const route = routeForPath(path);
    if (route == null) return {};
    return warmOnIntent(() => { preloadRoute(route); prefetchData(route); });
  }, [prefetchData]);
}
