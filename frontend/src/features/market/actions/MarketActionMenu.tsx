import { useEffect, useId, useRef, useState } from "react";

import bidIconUrl from "../../../assets/button_bid.svg";
import { bidAmountTooltipLabel } from "../bidTooltip";
import type { MarketRow } from "../model/row";
import { resolveMarketActionOffers, type MarketActionContext } from "./marketActions";
import type { useMarketActions } from "./useMarketActions";

type MarketActionsApi = ReturnType<typeof useMarketActions>;

type MarketActionMenuProps = {
  row: MarketRow;
  context: MarketActionContext;
  actions: MarketActionsApi;
};

export function MarketActionMenu({ row, context, actions }: MarketActionMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const offers = resolveMarketActionOffers(row, context);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (offers.length === 0) return null;

  const bidded = row.myBid != null;
  const bidMoney = row.myBid?.money;

  return (
    <div
      className={
        bidded
          ? "market-actions has-hover-tooltip-panel is-bid-tooltip-target"
          : "market-actions"
      }
      ref={rootRef}
    >
      <button
        type="button"
        className={bidded ? "market-actions-trigger is-bidded" : "market-actions-trigger"}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {bidded ? (
          <>
            <img className="market-actions-bid-icon" src={bidIconUrl} alt="" aria-hidden />
            <span>Bidded</span>
          </>
        ) : (
          "Options"
        )}
      </button>
      {bidded && bidMoney != null ? (
        <span className="hover-tooltip-panel is-align-end" role="tooltip">
          {bidAmountTooltipLabel(bidMoney)}
        </span>
      ) : null}
      {open ? (
        <ul id={menuId} className="market-actions-menu" role="menu">
          {offers.map((offer) => (
            <li
              key={
                offer.type === "bid"
                  ? offer.kind
                  : offer.type === "cancel-bid"
                    ? "cancel-bid"
                    : "clause"
              }
              role="none"
              title={offer.enabled ? undefined : offer.disabledReason}
            >
              <button
                type="button"
                role="menuitem"
                className={
                  offer.type === "cancel-bid"
                    ? "market-actions-item is-cancel-bid"
                    : "market-actions-item"
                }
                disabled={!offer.enabled || actions.actionPending}
                aria-disabled={!offer.enabled || actions.actionPending}
                onClick={() => {
                  if (!offer.enabled || actions.actionPending) return;
                  setOpen(false);
                  if (offer.type === "bid") {
                    actions.openBid(row, offer.kind);
                  } else if (offer.type === "cancel-bid") {
                    actions.cancelBid(row);
                  } else {
                    actions.openClause(row, offer.amount);
                  }
                }}
              >
                {offer.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
