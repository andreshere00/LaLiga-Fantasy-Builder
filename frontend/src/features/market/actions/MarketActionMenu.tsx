import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";

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

type MarketActionMenuProps = {
  row: MarketRow;
  context: MarketActionContext;
  actions: MarketActionsApi;
  detailsPlayer?: { id: string; name: string };
  detailsReturnTo?: "/market" | "/players";
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
      ? `Time remaining to expire the release clause: ${unlockLabel}`
      : null;
    return countdown ? `${CLAUSE_BLOCKED_MESSAGE}\n${countdown}` : CLAUSE_BLOCKED_MESSAGE;
  }
  return offer.disabledReason ?? CLAUSE_BLOCKED_MESSAGE;
}

export function MarketActionMenu({
  row,
  context,
  actions,
  detailsPlayer,
  detailsReturnTo,
}: MarketActionMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const bidTooltipId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const offers = resolveMarketActionOffers(row, context);
  const showPlayerDetails = detailsPlayer != null && row.positionId !== 5;

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (offers.length === 0 && !showPlayerDetails) return null;

  const bidded = row.myBid != null;
  const bidMoney = row.myBid?.money;
  const clauseTimeLocked = isClauseTimeLocked(row, context.now);
  const unlockLabel = clauseTimeLocked
    ? clauseUnlockCountdown(row.clauseUnlockAt, context.now)
    : null;

  return (
    <div
      className={[
        bidded
          ? "market-actions has-hover-tooltip-panel is-bid-tooltip-target"
          : "market-actions",
        open ? "is-open" : "",
      ].filter(Boolean).join(" ")}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className={bidded ? "market-actions-trigger is-bidded" : "market-actions-trigger"}
        aria-expanded={open}
        aria-controls={menuId}
        aria-describedby={bidded && bidMoney != null ? bidTooltipId : undefined}
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
        <span id={bidTooltipId} className="hover-tooltip-panel is-align-end" role="tooltip">
          {bidAmountTooltipLabel(bidMoney)}
        </span>
      ) : null}
      {open ? (
        <ul id={menuId} className="market-actions-menu">
          {offers.map((offer) => {
            const tooltip = menuItemTooltip(offer, row, clauseTimeLocked, unlockLabel);
            const tooltipLines = tooltip?.split("\n") ?? [];
            const itemKey = offer.type === "bid" ? offer.kind : offer.type;
            const tooltipId = `${menuId}-${itemKey}-tip`;
            return (
              <li
                key={itemKey}
                className={
                  tooltip ? "market-actions-menu-item has-hover-tooltip-panel" : undefined
                }
              >
                <button
                  type="button"
                  className={
                    offer.type === "cancel-bid"
                      ? "market-actions-item is-cancel-bid"
                      : "market-actions-item"
                  }
                  aria-disabled={!offer.enabled || actions.actionPending}
                  aria-describedby={tooltip ? tooltipId : undefined}
                  onClick={() => {
                    if (!offer.enabled || actions.actionPending) return;
                    setOpen(false);
                    if (offer.type === "bid") {
                      actions.openBid(row, offer.kind);
                    } else if (offer.type === "cancel-bid") {
                      actions.cancelBid(row);
                    } else if (offer.type === "withdraw") {
                      actions.openWithdraw(row);
                    } else if (offer.type === "pay-clause") {
                      actions.openClause(row, offer.amount);
                    }
                  }}
                >
                  {offer.label}
                </button>
                {tooltip ? (
                  <span id={tooltipId} className="hover-tooltip-panel is-align-start" role="tooltip">
                    {tooltipLines.map((line, index) => (
                      <span key={line} className="market-actions-tooltip-line">
                        {index > 0 ? <br /> : null}
                        {line}
                      </span>
                    ))}
                  </span>
                ) : null}
              </li>
            );
          })}
          {showPlayerDetails && detailsPlayer ? (
            <li className="market-actions-menu-item">
              <Link
                className="market-actions-item players-action-link"
                role="menuitem"
                to={`/players/${encodeURIComponent(detailsPlayer.id)}`}
                state={detailsReturnTo ? { returnTo: detailsReturnTo } : undefined}
                onClick={() => setOpen(false)}
              >
                Player details
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
