import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteJson, paths, postJson } from "../../api/client";
import { leagueId } from "../../api/mappers";
import { NeedsReauthError } from "../../api/errors";
import { useAuth } from "../../auth/AuthProvider";
import { ListingReplaceError } from "./squadSale";
import { useLeague } from "./LeagueProvider";

async function refreshSquadSales(
  queryClient: ReturnType<typeof useQueryClient>,
  leagueKey: string,
): Promise<void> {
  await Promise.all([
    queryClient.refetchQueries({ queryKey: ["team", leagueKey] }),
    queryClient.refetchQueries({ queryKey: ["lineup", leagueKey] }),
    queryClient.refetchQueries({ queryKey: ["team-money", leagueKey] }),
    queryClient.refetchQueries({ queryKey: ["market", leagueKey] }),
    queryClient.refetchQueries({ queryKey: ["standing", leagueKey] }),
  ]);
}

/** Lists a squad player or sells them immediately, then refreshes squad data. */
export function useSquadSales() {
  const queryClient = useQueryClient();
  const { accessToken, markNeedsReauth } = useAuth();
  const { selected } = useLeague();
  const leagueKey = selected ? leagueId(selected) : "";

  const onError = (error: unknown) => {
    if (error instanceof NeedsReauthError) markNeedsReauth();
  };

  const listPlayer = useMutation({
    mutationFn: async (input: { playerTeamId: string; salePrice: number }) => {
      if (!accessToken || leagueKey === "") {
        throw new Error("Market listing requires a signed-in league.");
      }
      return postJson(paths.marketListings(leagueKey), accessToken, {
        playerId: input.playerTeamId,
        salePrice: input.salePrice,
      });
    },
    onSuccess: () => refreshSquadSales(queryClient, leagueKey),
    onError,
  });

  const cancelListing = useMutation({
    mutationFn: async (marketId: string) => {
      if (!accessToken || leagueKey === "") {
        throw new Error("Cancelling an offer requires a signed-in league.");
      }
      return deleteJson(paths.marketListing(leagueKey, marketId), accessToken);
    },
    onSuccess: () => refreshSquadSales(queryClient, leagueKey),
    onError,
  });

  const modifyListing = useMutation({
    mutationFn: async (input: { playerTeamId: string; marketId: string; salePrice: number }) => {
      if (!accessToken || leagueKey === "") {
        throw new Error("Changing an offer requires a signed-in league.");
      }
      await deleteJson(paths.marketListing(leagueKey, input.marketId), accessToken);
      try {
        return await postJson(paths.marketListings(leagueKey), accessToken, {
          playerId: input.playerTeamId,
          salePrice: input.salePrice,
        });
      } catch (error) {
        if (error instanceof NeedsReauthError) throw error;
        throw new ListingReplaceError();
      }
    },
    onSuccess: () => refreshSquadSales(queryClient, leagueKey),
    onError: (error) => {
      onError(error);
      if (error instanceof ListingReplaceError) {
        void refreshSquadSales(queryClient, leagueKey);
      }
    },
  });

  const sellImmediately = useMutation({
    mutationFn: async (playerTeamId: string) => {
      if (!accessToken || leagueKey === "") {
        throw new Error("Immediate sale requires a signed-in league.");
      }
      return postJson(paths.marketImmediateSale(leagueKey), accessToken, {
        playerId: playerTeamId,
      });
    },
    onSuccess: () => refreshSquadSales(queryClient, leagueKey),
    onError,
  });

  return { listPlayer, cancelListing, modifyListing, sellImmediately, leagueKey };
}
