import { useRetained } from "../../../hooks/useRetained";
import { BidDialog } from "./BidDialog";
import { CancelBidDialog } from "./CancelBidDialog";
import { ClauseDialog } from "./ClauseDialog";
import { WithdrawDialog } from "./WithdrawDialog";
import type { MarketActionsApi } from "./useMarketActions";

type MarketActionDialogsProps = {
  actions: MarketActionsApi;
  money: number | null;
  squadMarketValue: number | null;
};

/** Renders the shared confirmation dialogs for one market-action controller. */
export function MarketActionDialogs({
  actions,
  money,
  squadMarketValue,
}: MarketActionDialogsProps) {
  const bid = useRetained(actions.pendingBid);
  const clause = useRetained(actions.pendingClause);
  const withdraw = useRetained(actions.pendingWithdraw);
  const cancelBid = useRetained(actions.pendingCancelBid);

  return (
    <>
      <BidDialog
        open={actions.pendingBid != null}
        row={bid?.row ?? null}
        kind={bid?.kind ?? null}
        money={money}
        squadMarketValue={squadMarketValue}
        initialAmount={bid?.initialAmount ?? null}
        pending={actions.actionPending}
        error={actions.message}
        onClose={actions.closeBid}
        onConfirm={actions.submitBid}
      />
      <WithdrawDialog
        open={actions.pendingWithdraw != null}
        row={withdraw}
        pending={actions.actionPending}
        error={actions.message}
        onClose={actions.closeWithdraw}
        onConfirm={actions.confirmWithdraw}
      />
      <CancelBidDialog
        open={actions.pendingCancelBid != null}
        row={cancelBid}
        pending={actions.actionPending}
        error={actions.message}
        onClose={actions.closeCancelBid}
        onConfirm={actions.confirmCancelBid}
      />
      <ClauseDialog
        open={actions.pendingClause != null}
        row={clause?.row ?? null}
        amount={clause?.amount ?? 0}
        pending={actions.actionPending}
        error={actions.message}
        onClose={actions.closeClause}
        onConfirm={actions.confirmClause}
      />
    </>
  );
}
