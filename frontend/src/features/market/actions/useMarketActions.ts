import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { deleteJson, paths, postJson, putJson } from "../../../api/client";
import { ApiError, NeedsReauthError } from "../../../api/errors";
import { useAuth } from "../../../auth/AuthProvider";
import { useLeague } from "../../lineup/LeagueProvider";
import { callerTeamId, leagueId } from "../../../api/mappers";
import { patchMarketSnapshotBid } from "../marketRows";
import {
  clearPendingBid,
  isLocalBidId,
  localBidId,
  recordPendingBid,
} from "../model/pendingBids";
import type { MarketRow } from "../model/row";
import { marketActionErrorMessage, type MarketActionKind } from "./marketActionErrors";
import { usesDirectOfferBid, type BidActionKind } from "./marketActions";

const FOLLOW_UP_REFETCH_MS: readonly number[] = [1_500, 4_000];

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
    (
      marketId: string,
      myBid: { id: string; money: number } | null,
      removedBidId?: string | null,
    ) => {
      if (leagueKey === "") return;
      recordPendingBid(queryClient, leagueKey, marketId, myBid, removedBidId ?? null);
      queryClient.setQueryData(["market", leagueKey], (current) =>
        patchMarketSnapshotBid(current, marketId, myBid, {
          removedBidId: removedBidId ?? null,
        }),
      );
    },
    [queryClient, leagueKey],
  );

  const refreshAfterMutation = useCallback(async () => {
    for (const delay of FOLLOW_UP_REFETCH_MS) {
      window.setTimeout(() => {
        void queryClient.refetchQueries({ queryKey: ["market", leagueKey] });
      }, delay);
    }
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

  const reportError = useCallback(
    (error: unknown, kind: MarketActionKind) => {
      if (error instanceof NeedsReauthError) {
        markNeedsReauth();
        return;
      }
      setMessage(marketActionErrorMessage(error, kind));
    },
    [markNeedsReauth],
  );

  const onBidError = useCallback(
    async (error: unknown) => {
      reportError(error, "bid");
      await refreshAfterMutation();
    },
    [reportError, refreshAfterMutation],
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
        id: variables.row.myBid?.id ?? localBidId(variables.row.marketId),
        money: variables.money,
      });
      await refreshAfterMutation();
    },
    onError: onBidError,
  });

  const modifyBid = useMutation({
    mutationFn: async ({ row, money }: { row: MarketRow; money: number }) => {
      const bidId = row.myBid?.id;
      if (!bidId || isLocalBidId(bidId)) throw new ApiError(400, "missing_bid");
      return putJson(paths.marketBidUpdate(leagueKey, row.marketId, bidId), token, { money });
    },
    onSuccess: async (_data, variables) => {
      setPendingBid(null);
      setMessage(null);
      const bidId = variables.row.myBid?.id ?? localBidId(variables.row.marketId);
      patchCachedBid(variables.row.marketId, { id: bidId, money: variables.money });
      await refreshAfterMutation();
    },
    onError: onBidError,
  });

  const cancelBid = useMutation({
    mutationFn: async (row: MarketRow) => {
      const bidId = row.myBid?.id;
      if (!bidId) throw new ApiError(400, "missing_bid");
      if (isLocalBidId(bidId)) throw new ApiError(400, "missing_bid");
      return deleteJson(paths.marketBidUpdate(leagueKey, row.marketId, bidId), token);
    },
    onMutate: async (row) => {
      await queryClient.cancelQueries({ queryKey: ["market", leagueKey] });
      patchCachedBid(row.marketId, null, row.myBid?.id ?? null);
    },
    onSuccess: async (_data, row) => {
      setMessage(null);
      patchCachedBid(row.marketId, null, row.myBid?.id ?? null);
      await refreshAfterMutation();
    },
    onError: async (error, row) => {
      clearPendingBid(queryClient, leagueKey, row.marketId);
      await onBidError(error);
    },
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
    onError: (error) => reportError(error, "clause"),
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

  const closeBid = useCallback(() => setPendingBid(null), []);
  const closeClause = useCallback(() => setPendingClause(null), []);
  const dismissMessage = useCallback(() => setMessage(null), []);

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
    closeBid,
    closeClause,
    submitBid,
    confirmClause,
    cancelBid: cancelBidForRow,
    actionPending: pending,
    message,
    dismissMessage,
  };
}
