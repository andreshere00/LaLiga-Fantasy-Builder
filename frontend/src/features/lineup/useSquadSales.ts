import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteJson, paths, postJson } from "../../api/client";
import { listingWriteSchema } from "../../api/schemas";
import { parseSquadPlayerId } from "../../api/ids";
import { upstreamPlayerIdBody } from "../../api/mutationBodies";
import { leagueId } from "../../api/mappers";
import { ApiContractError, NeedsReauthError } from "../../api/errors";
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

  const onError = async (error: unknown) => {
    if (error instanceof NeedsReauthError) markNeedsReauth();
    if (error instanceof ApiContractError) await refreshSquadSales(queryClient, leagueKey);
  };

  const listPlayer = useMutation({
    retry: false,
    mutationFn: async (input: { playerTeamId: string; salePrice: number }) => {
      if (!accessToken || leagueKey === "") {
        throw new Error("Market listing requires a signed-in league.");
      }
      const squadId = parseSquadPlayerId(input.playerTeamId);
      if (!squadId) throw new Error("Invalid squad player id.");
      return postJson(paths.marketListings(leagueKey), accessToken, {
        ...upstreamPlayerIdBody(squadId),
        salePrice: input.salePrice,
      });
    },
    onSuccess: () => refreshSquadSales(queryClient, leagueKey),
    onError,
  });

  const cancelListing = useMutation({
    retry: false,
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
    retry: false,
    mutationFn: async (input: { playerTeamId: string; marketId: string; salePrice: number }) => {
      if (!accessToken || leagueKey === "") {
        throw new Error("Changing an offer requires a signed-in league.");
      }
      const squadId = parseSquadPlayerId(input.playerTeamId);
      if (!squadId) throw new Error("Invalid squad player id.");
      const listingPath = paths.marketListings(leagueKey);
      const previousPath = paths.marketListing(leagueKey, input.marketId);
      const body = listingWriteSchema.parse({
        ...upstreamPlayerIdBody(squadId), salePrice: input.salePrice,
      });
      await deleteJson(previousPath, accessToken);
      try {
        return await postJson(listingPath, accessToken, body);
      } catch (error) {
        if (error instanceof NeedsReauthError) throw error;
        throw new ListingReplaceError();
      }
    },
    onSuccess: () => refreshSquadSales(queryClient, leagueKey),
    onError: async (error) => {
      await onError(error);
      if (error instanceof ListingReplaceError) {
        await refreshSquadSales(queryClient, leagueKey);
      }
    },
  });

  const sellImmediately = useMutation({
    retry: false,
    mutationFn: async (playerTeamId: string) => {
      if (!accessToken || leagueKey === "") {
        throw new Error("Immediate sale requires a signed-in league.");
      }
      const squadId = parseSquadPlayerId(playerTeamId);
      if (!squadId) throw new Error("Invalid squad player id.");
      return postJson(
        paths.marketImmediateSale(leagueKey),
        accessToken,
        upstreamPlayerIdBody(squadId),
      );
    },
    onSuccess: () => refreshSquadSales(queryClient, leagueKey),
    onError,
  });

  return { listPlayer, cancelListing, modifyListing, sellImmediately, leagueKey };
}

export type SquadSalesApi = ReturnType<typeof useSquadSales>;
