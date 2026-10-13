import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getJson, paths } from "../../../api/client";
import {
  callerTeamId,
  captainIdOf,
  catalogMediaByMasterId,
  leagueId,
  playersOf,
  squadCards,
} from "../../../api/mappers";
import { usePlayersCatalogQuery, useReauthOnError } from "../../../api/queries";
import { useAuth } from "../../../auth/AuthProvider";
import { useLeague } from "../../lineup/LeagueProvider";

export function useOwnSquadOffers() {
  const { accessToken } = useAuth();
  const { selected, isLoading: leaguesLoading } = useLeague();
  const leagueKey = selected ? leagueId(selected) : "";
  const teamId = selected ? callerTeamId(selected) : null;
  const enabled = accessToken != null && leagueKey !== "" && teamId != null;
  const teamQuery = useQuery({
    queryKey: ["team", leagueKey, teamId],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => getJson(paths.team(leagueKey, teamId ?? ""), accessToken ?? "", { signal }),
  });
  const catalogQuery = usePlayersCatalogQuery(enabled);
  useReauthOnError([teamQuery.error, catalogQuery.error]);
  const cards = useMemo(
    () => squadCards(
      playersOf(teamQuery.data),
      captainIdOf(teamQuery.data),
      catalogMediaByMasterId(catalogQuery.data),
    ),
    [catalogQuery.data, teamQuery.data],
  );

  return { cards, squadAvailable: teamQuery.isSuccess && !leaguesLoading };
}
