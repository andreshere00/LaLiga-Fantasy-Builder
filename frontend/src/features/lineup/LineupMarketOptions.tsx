import type { SquadCard } from "../../api/mappers";
import { Modal } from "../../components/Modal";
import { useNow } from "../../hooks/useNow";
import { useRetained } from "../../hooks/useRetained";
import { BidDialog } from "../market/actions/BidDialog";
import { ClauseDialog } from "../market/actions/ClauseDialog";
import { WithdrawDialog } from "../market/actions/WithdrawDialog";
import { resolveMarketActionOffers } from "../market/actions/marketActions";
import { useMarketActions } from "../market/actions/useMarketActions";
import { useMarketBoard } from "../market/useMarketBoard";
import "../market/MarketPage.css";

type Props = { player: SquadCard; open: boolean; onClose: () => void };

/** Load opponent market actions only when the player menu requests them. */
export function LineupMarketOptions({ player, open, onClose }: Props) {
  return open ? <OpponentMarketOptions player={player} onClose={onClose} /> : null;
}

function OpponentMarketOptions({ player, onClose }: Omit<Props, "open">) {
  const board = useMarketBoard();
  const actions = useMarketActions();
  const now = useNow();
  const bid = useRetained(actions.pendingBid);
  const clause = useRetained(actions.pendingClause);
  const withdraw = useRetained(actions.pendingWithdraw);
  const row = board.rows.find((item) => item.playerId === player.masterPlayerId &&
    (item.playerTeamId === player.id || item.playerTeamId == null));
  const context = {
    money: board.money,
    now,
    callerTeamId: board.callerTeamId,
    squadPlayerCount: board.squadPlayerCount,
    activeBidCount: board.activeBidCount,
    squadMarketValue: board.squadMarketValue,
  };
  const offers = row ? resolveMarketActionOffers(row, context) : [];
  const confirming = actions.pendingBid != null || actions.pendingClause != null ||
    actions.pendingWithdraw != null;

  return (
    <>
      <Modal open={!confirming} title={`${player.name} — Market options`} onClose={onClose}
        closeOnBackdrop={!actions.actionPending} squareCorners>
        {board.isLoading ? <p role="status">Loading market options…</p> : board.hasError ? (
          <p role="alert">Market options could not be loaded.</p>
        ) : offers.length === 0 ? (
          <p>No market actions are currently available for this player.</p>
        ) : (
          <div className="squad-sale-choices">
            {offers.map((offer) => (
              <div key={offer.type}>
                <button type="button" className="squad-sale-choice"
                  disabled={!offer.enabled || actions.actionPending}
                  onClick={() => {
                    if (!row || !offer.enabled || actions.actionPending) return;
                    if (offer.type === "bid") actions.openBid(row, offer.kind);
                    else if (offer.type === "cancel-bid") actions.cancelBid(row);
                    else if (offer.type === "withdraw") actions.openWithdraw(row);
                    else if (offer.type === "pay-clause") actions.openClause(row, offer.amount);
                  }}>
                  {offer.label}
                </button>
                {offer.disabledReason ? <p className="squad-sale-note">{offer.disabledReason}</p> : null}
              </div>
            ))}
          </div>
        )}
        {actions.message ? <p role="alert">{actions.message}</p> : null}
      </Modal>
      <BidDialog squareCorners open={actions.pendingBid != null} row={bid?.row ?? null}
        kind={bid?.kind ?? null} money={board.money} squadMarketValue={board.squadMarketValue}
        initialAmount={bid?.initialAmount ?? null} pending={actions.actionPending}
        error={actions.message} onClose={actions.closeBid} onConfirm={actions.submitBid} />
      <WithdrawDialog squareCorners open={actions.pendingWithdraw != null} row={withdraw}
        pending={actions.actionPending} error={actions.message}
        onClose={actions.closeWithdraw} onConfirm={actions.confirmWithdraw} />
      <ClauseDialog squareCorners open={actions.pendingClause != null} row={clause?.row ?? null}
        amount={clause?.amount ?? 0} pending={actions.actionPending}
        error={actions.message} onClose={actions.closeClause} onConfirm={actions.confirmClause} />
    </>
  );
}
