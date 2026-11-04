import { copy as localizeCopy, useLanguage } from "../../i18n";
import type { SquadCard } from "../../api/mappers";
import { Dialog } from "../../components/ui/Dialog";
import { useNow } from "../../hooks/useNow";
import { MarketActionDialogs } from "../market/actions/MarketActionDialogs";
import { resolveMarketActionOffers } from "../market/actions/marketActions";
import { useMarketActions } from "../market/actions/useMarketActions";
import { useMarketBoard } from "../market/useMarketBoard";
import "../../components/ui/RichList.css";

type Props = { player: SquadCard; open: boolean; onClose: () => void };

/** Load opponent market actions only when the player menu requests them. */
export function LineupMarketOptions({ player, open, onClose }: Props) {
  useLanguage();
  return open ? <OpponentMarketOptions player={player} onClose={onClose} /> : null;
}

function OpponentMarketOptions({ player, onClose }: Omit<Props, "open">) {
  useLanguage();
  const board = useMarketBoard();
  const actions = useMarketActions();
  const now = useNow();
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
      <Dialog open={!confirming} title={localizeCopy(`${player.name} — Market options`)} onClose={onClose}
        closeOnBackdrop={!actions.actionPending}>
        {board.isLoading ? <p role="status">{localizeCopy("Loading market options…")}</p> : board.hasError ? (
          <p role="alert">{localizeCopy("Market options could not be loaded.")}</p>
        ) : offers.length === 0 ? (
          <p>{localizeCopy("No market actions are currently available for this player.")}</p>
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
                  {localizeCopy(offer.label)}
                </button>
                {offer.disabledReason ? <p className="squad-sale-note">{localizeCopy(offer.disabledReason)}</p> : null}
              </div>
            ))}
          </div>
        )}
        {actions.message ? <p role="alert">{localizeCopy(actions.message)}</p> : null}
      </Dialog>
      <MarketActionDialogs
        actions={actions}
        money={board.money}
        squadMarketValue={board.squadMarketValue}
      />
    </>
  );
}
