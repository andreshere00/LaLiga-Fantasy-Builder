import { t, useTranslation } from "../../i18n";
import type { SquadCard } from "../../api/mappers";
import { Dialog } from "../../components/ui/Dialog";
import { useNow } from "../../hooks/useNow";
import { MarketActionDialogs } from "../market/actions/MarketActionDialogs";
import { resolveMarketActionOffers } from "../market/actions/marketActions";
import { useMarketActions } from "../market/actions/useMarketActions";
import { useMarketBoard } from "../market/useMarketBoard";
import { formatEuro } from "../../api/format";
import type { MarketActionOffer } from "../market/actions/marketActions";
import { PlayerActionRow, type PlayerActionIcon, type PlayerActionTone } from "./PlayerActionRow";
import "../../components/ui/RichList.css";
import "./SquadPlayerActions.css";

const OFFER_VISUAL: Record<MarketActionOffer["type"], { icon: PlayerActionIcon; tone: PlayerActionTone }> = {
  bid: { icon: "euro_symbol", tone: "market" },
  "pay-clause": { icon: "flash_on", tone: "market" },
  "cancel-bid": { icon: "close", tone: "danger" },
  withdraw: { icon: "close", tone: "danger" },
  "immediate-sell": { icon: "flash_on", tone: "danger" },
};

type Props = { player: SquadCard; open: boolean; onClose: () => void };

/** Load opponent market actions only when the player menu requests them. */
export function LineupMarketOptions({ player, open, onClose }: Props) {
  return open ? <OpponentMarketOptions player={player} onClose={onClose} /> : null;
}

function OpponentMarketOptions({ player, onClose }: Omit<Props, "open">) {
  useTranslation();
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
      <Dialog open={!confirming} title={t("{{0}} — Market options", { 0: player.name })} onClose={onClose}
        closeOnBackdrop={!actions.actionPending}>
        {board.isLoading ? <p role="status">{t("Loading market options…")}</p> : board.hasError ? (
          <p role="alert">{t("Market options could not be loaded.")}</p>
        ) : offers.length === 0 ? (
          <p>{t("No market actions are currently available for this player.")}</p>
        ) : (
          <div className="squad-sale-choices">
            {offers.map((offer) => {
              const visual = OFFER_VISUAL[offer.type];
              return (
                <PlayerActionRow key={offer.type === "bid" ? `bid-${offer.kind}` : offer.type}
                  icon={visual.icon} tone={visual.tone} label={t(offer.label)}
                  hint={offer.disabledReason ? t(offer.disabledReason)
                    : offer.type === "pay-clause" ? formatEuro(offer.amount) : null}
                  disabled={!offer.enabled || actions.actionPending}
                  onClick={() => {
                    if (!row || !offer.enabled || actions.actionPending) return;
                    if (offer.type === "bid") actions.openBid(row, offer.kind);
                    else if (offer.type === "cancel-bid") actions.cancelBid(row);
                    else if (offer.type === "withdraw") actions.openWithdraw(row);
                    else if (offer.type === "pay-clause") actions.openClause(row, offer.amount);
                  }} />
              );
            })}
          </div>
        )}
        {actions.message ? <p role="alert">{t(actions.message)}</p> : null}
      </Dialog>
      <MarketActionDialogs
        actions={actions}
        money={board.money}
        squadMarketValue={board.squadMarketValue}
      />
    </>
  );
}
