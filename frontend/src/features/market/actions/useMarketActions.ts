import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { deleteJson, paths, postJson, putJson } from "../../../api/client";
import { ApiError, NeedsReauthError } from "../../../api/errors";
import { useAuth } from "../../../auth/AuthProvider";
import { useLeague } from "../../lineup/LeagueProvider";
import { callerTeamId, leagueId } from "../../../api/mappers";
import { patchMarketSnapshotBid } from "../marketRows";
import type { MarketRow } from "../model/row";
import { marketActionErrorMessage } from "./marketActionErrors";
import { usesDirectOfferBid, type BidActionKind } from "./marketActions";

type PendingBid = {
  row: MarketRow;
  kind: BidActionKind;
  initialAmount: number | null;
};

type PendingClause = {
  row: MarketRow;
  amount: number;
};

export function useMarketActions() {
  const queryClient = useQueryClient();
  const { accessToken, markNeedsReauth } = useAuth();
  const { selected } = useLeague();
  const leagueKey = selected ? leagueId(selected) : "";
  const token = accessToken ?? "";
  const [pendingBid, setPendingBid] = useState<PendingBid | null>(null);
  const [pendingClause, setPendingClause] = useState<PendingClause | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const teamId = selected ? callerTeamId(selected) : null;

  const patchCachedBid = useCallback(
    (marketId: string, myBid: { id: string; money: number } | null) => {
      if (leagueKey === "") return;
      queryClient.setQueryData(["market", leagueKey], (current) =>
        patchMarketSnapshotBid(current, marketId, myBid),
      );
    },
    [queryClient, leagueKey],
  );

  const refreshAfterMutation = useCallback(async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["market", leagueKey] }),
      teamId
        ? queryClient.refetchQueries({ queryKey: ["team-money", leagueKey, teamId] })
        : Promise.resolve(),
      teamId
        ? queryClient.refetchQueries({ queryKey: ["team", leagueKey, teamId] })
        : Promise.resolve(),
    ]);
  }, [queryClient, leagueKey, teamId]);

  const onError = useCallback(
    (error: unknown) => {
      if (error instanceof NeedsReauthError) {
        markNeedsReauth();
        return;
      }
      setMessage(marketActionErrorMessage(error));
    },
    [markNeedsReauth],
  );

  const createBid = useMutation({
    mutationFn: async ({
      row,
      money,
      kind,
    }: {
      row: MarketRow;
      money: number;
      kind: BidActionKind;
    }) => {
      if (usesDirectOfferBid(row, kind)) {
        return postJson(paths.marketDirectOffer(leagueKey), token, {
          playerId: row.playerTeamId,
          money,
        });
      }
      return postJson(paths.marketBid(leagueKey, row.marketId), token, { money });
    },
    onSuccess: async (_data, variables) => {
      setPendingBid(null);
      setMessage(null);
      patchCachedBid(variables.row.marketId, {
        id: variables.row.myBid?.id ?? `local-${variables.row.marketId}`,
        money: variables.money,
      });
      await refreshAfterMutation();
    },
    onError,
  });

  const modifyBid = useMutation({
    mutationFn: async ({ row, money }: { row: MarketRow; money: number }) => {
      const bidId = row.myBid?.id;
      if (!bidId) throw new ApiError(400, "missing_bid");
      return putJson(paths.marketBidUpdate(leagueKey, row.marketId, bidId), token, { money });
    },
    onSuccess: async (_data, variables) => {
      setPendingBid(null);
      setMessage(null);
      const bidId = variables.row.myBid?.id ?? `local-${variables.row.marketId}`;
      patchCachedBid(variables.row.marketId, { id: bidId, money: variables.money });
      await refreshAfterMutation();
    },
    onError,
  });

  const cancelBid = useMutation({
    mutationFn: async (row: MarketRow) => {
      const bidId = row.myBid?.id;
      if (!bidId) throw new ApiError(400, "missing_bid");
      return deleteJson(paths.marketBidUpdate(leagueKey, row.marketId, bidId), token);
    },
    onSuccess: async (_data, row) => {
      setMessage(null);
      patchCachedBid(row.marketId, null);
      await refreshAfterMutation();
    },
    onError,
  });

  const payClause = useMutation({
    mutationFn: async ({ row, amount }: { row: MarketRow; amount: number }) => {
      const playerTeamId = row.playerTeamId;
      if (!playerTeamId) throw new ApiError(400, "missing_player");
      return postJson(paths.buyoutPay(leagueKey, playerTeamId), token, {
        buyoutClauseToPay: amount,
      });
    },
    onSuccess: async () => {
      setPendingClause(null);
      setMessage(null);
      await refreshAfterMutation();
    },
    onError,
  });

  const openBid = useCallback((row: MarketRow, kind: BidActionKind) => {
    setMessage(null);
    setPendingBid({
      row,
      kind,
      initialAmount: kind === "modify" ? (row.myBid?.money ?? null) : null,
    });
  }, []);

  const openClause = useCallback((row: MarketRow, amount: number) => {
    setMessage(null);
    setPendingClause({ row, amount });
  }, []);

  const submitBid = useCallback(
    (money: number) => {
      if (!pendingBid) return;
      if (pendingBid.kind === "modify") {
        modifyBid.mutate({ row: pendingBid.row, money });
      } else {
        createBid.mutate({ row: pendingBid.row, money, kind: pendingBid.kind });
      }
    },
    [createBid, modifyBid, pendingBid],
  );

  const confirmClause = useCallback(() => {
    if (!pendingClause) return;
    payClause.mutate({ row: pendingClause.row, amount: pendingClause.amount });
  }, [payClause, pendingClause]);

  const cancelBidForRow = useCallback(
    (row: MarketRow) => {
      setMessage(null);
      cancelBid.mutate(row);
    },
    [cancelBid],
  );

  const pending =
    createBid.isPending ||
    modifyBid.isPending ||
    cancelBid.isPending ||
    payClause.isPending;

  return {
    pendingBid,
    pendingClause,
    openBid,
    openClause,
    closeBid: () => setPendingBid(null),
    closeClause: () => setPendingClause(null),
    submitBid,
    confirmClause,
    cancelBid: cancelBidForRow,
    actionPending: pending,
    message,
    dismissMessage: () => setMessage(null),
  };
}
