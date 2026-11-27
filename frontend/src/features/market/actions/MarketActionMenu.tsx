import { t, useTranslation } from "../../../i18n";
import { Menu } from "@base-ui/react/menu";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { Help } from "../../../components/ui/Help";
import bidIconUrl from "../../../assets/button_bid.svg";
import { bidAmountTooltipLabel } from "../bidTooltip";
import {
  CLAUSE_BLOCKED_MESSAGE,
  COACH_HIRE_PREMIUM_MESSAGE,
  isCoachMarketHire,
} from "../marketMessages";
import type { MarketRow } from "../model/row";
import { clauseUnlockCountdown } from "../model/valueSeries";
import {
  isClauseTimeLocked,
  resolveMarketActionOffers,
  type MarketActionContext,
  type MarketActionOffer,
} from "./marketActions";
import type { MarketActionsApi } from "./useMarketActions";
import { useMarketOffersMenu } from "../offers/MarketOffersContext";
import { useAutoMarket } from "../../autoMarket/AutoMarketProvider";
import { autoBuyTarget } from "../../autoMarket/autoBuyTarget";

type MarketActionMenuProps = {
  row: MarketRow;
  context: MarketActionContext;
  actions: MarketActionsApi;
  detailsPlayer?: { id: string; name: string };
  detailsReturnTo?: string;
};

function menuItemTooltip(
  offer: MarketActionOffer,
  row: MarketRow,
  clauseTimeLocked: boolean,
  unlockLabel: string | null,
): string | null {
  if (offer.type === "bid" && !offer.enabled && isCoachMarketHire(row.positionId, offer.kind)) {
    return COACH_HIRE_PREMIUM_MESSAGE;
  }
  if (offer.enabled) return null;
  if (offer.type !== "pay-clause") return offer.disabledReason ?? null;
  if (clauseTimeLocked) {
    const countdown = unlockLabel
      ? t("Time remaining to expire the release clause: {{0}}", { 0: unlockLabel })
      : null;
    const blocked = t(CLAUSE_BLOCKED_MESSAGE);
    return countdown ? `${blocked}\n${countdown}` : blocked;
  }
  return offer.disabledReason ?? CLAUSE_BLOCKED_MESSAGE;
}

export function MarketActionMenu({ row, context, actions, detailsPlayer, detailsReturnTo }: MarketActionMenuProps) {
  useTranslation();
  const trigger = useRef<HTMLButtonElement>(null);
  const offersMenu = useMarketOffersMenu();
  const auto = useAutoMarket();
  const offers = resolveMarketActionOffers(row, context);
  const showPlayerDetails = detailsPlayer != null && row.positionId !== 5;
  const showPlayerOffers = offersMenu != null && row.sellerKind === "self"
    && row.playerTeamId != null;
  const bidded = row.myBid != null;
  const clauseTimeLocked = isClauseTimeLocked(row, context.now);
  const unlockLabel = clauseTimeLocked ? clauseUnlockCountdown(row.clauseUnlockAt, context.now) : null;
  const autoBuy = auto != null && row.sellerKind !== "self" && row.playerId != null && row.marketValue != null
    ? autoBuyTarget(row) : null;
  const autoRule = autoBuy && row.playerId ? auto?.liveRuleFor(row.playerId, "buy") ?? null : null;
  if (offers.length === 0 && !showPlayerDetails && !showPlayerOffers && !autoBuy) return null;
  return (
    <div className="market-actions">
      <Menu.Root>
        <Help content={row.myBid ? bidAmountTooltipLabel(row.myBid.money) : null}>
          <Menu.Trigger ref={trigger} className={"market-actions-trigger" + (bidded ? " is-bidded" : "")}>
            {bidded ? <><img className="market-actions-bid-icon" src={bidIconUrl} alt="" aria-hidden /><span>{t("Bidded")}</span></> : t("Options")}
          </Menu.Trigger>
        </Help>
        <Menu.Portal><Menu.Positioner sideOffset={4} align="end" className="fb-menu-positioner">
          <Menu.Popup className="fb-menu-popup">
            {offers.map((offer) => {
              const tooltip = menuItemTooltip(offer, row, clauseTimeLocked, unlockLabel);
              return (
                <Menu.Item key={offer.type === "bid" ? offer.kind : offer.type}
                  className="market-actions-item" disabled={!offer.enabled || actions.actionPending}
                  onClick={() => {
                    trigger.current?.focus();
                    if (offer.type === "bid") actions.openBid(row, offer.kind);
                    else if (offer.type === "cancel-bid") actions.openCancelBid(row);
                    else if (offer.type === "withdraw") actions.openWithdraw(row);
                    else if (offer.type === "pay-clause") actions.openClause(row, offer.amount);
                  }}>
                  <span>{t(offer.label)}</span>
                  {tooltip ? <span className="fb-helper">{t(tooltip)}</span> : null}
                </Menu.Item>
              );
            })}
            {autoBuy && auto ? (
              <Menu.Item className="market-actions-item" disabled={actions.actionPending || autoRule?.state === "executing"}
                onClick={() => {
                  trigger.current?.focus();
                  auto.openRule(autoBuy, autoRule?.state === "armed" ? autoRule : null);
                }}>
                <span>{t(autoRule ? "Edit auto-buy…" : "Auto-buy…")}</span>
                <span className="fb-helper">{t(autoRule ? "A rule is already armed for this player." : "Buy automatically when the value reaches a threshold.")}</span>
              </Menu.Item>
            ) : null}
            {showPlayerOffers ? (
              <Menu.Item className="market-actions-item" onClick={() => {
                trigger.current?.focus();
                offersMenu.openForPlayer(row.playerTeamId!, row.name);
              }}>{t("View offers for this player")}</Menu.Item>
            ) : null}
            {showPlayerDetails && detailsPlayer ? (
              <Menu.Item render={<Link to={"/players/" + encodeURIComponent(detailsPlayer.id)}
                state={detailsReturnTo ? { returnTo: detailsReturnTo } : undefined} />}
                className="market-actions-item">{t("Player details")}</Menu.Item>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner></Menu.Portal>
      </Menu.Root>
    </div>
  );
}
