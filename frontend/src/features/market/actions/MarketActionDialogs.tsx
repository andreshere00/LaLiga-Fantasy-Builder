import { useRetained } from "../../../hooks/useRetained";
import { BidDialog } from "./BidDialog";
import { ClauseDialog } from "./ClauseDialog";
import { WithdrawDialog } from "./WithdrawDialog";
import type { MarketActionsApi } from "./useMarketActions";

type MarketActionDialogsProps = {
  actions: MarketActionsApi;
  money: number | null;
  squadMarketValue: number | null;
  squareCorners?: boolean;
};

/** Renders the shared confirmation dialogs for one market-action controller. */
export function MarketActionDialogs({
  actions,
  money,
  squadMarketValue,
  squareCorners = false,
}: MarketActionDialogsProps) {
  const bid = useRetained(actions.pendingBid);
  const clause = useRetained(actions.pendingClause);
  const withdraw = useRetained(actions.pendingWithdraw);

  return (
    <>
      <BidDialog
        squareCorners={squareCorners}
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
        squareCorners={squareCorners}
        open={actions.pendingWithdraw != null}
        row={withdraw}
        pending={actions.actionPending}
        error={actions.message}
        onClose={actions.closeWithdraw}
        onConfirm={actions.confirmWithdraw}
      />
      <ClauseDialog
        squareCorners={squareCorners}
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
