import { copy as localizeCopy, useLanguage } from "../../../i18n";
import { useEffect, useRef, useState } from "react";
import { formatEuro } from "../../../api/format";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import type { MarketActionsApi } from "../actions/useMarketActions";
import type { MarketBoard } from "../useMarketBoard";
import type { MarketRow } from "../model/row";
import { remainingLabel } from "../model/valueSeries";
import "./MarketBids.css";

type Props = { board: MarketBoard; actions: MarketActionsApi; now: number };

/** Current commitments from the same pending-adjusted snapshot as the market table. */
export function MarketBids({ board, actions, now }: Props) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const refresh = useRef<HTMLButtonElement>(null);
  const total = useRef<HTMLParagraphElement>(null);
  const modifyAfterClose = useRef<MarketRow | null>(null);
  const focusAfterCancel = useRef(false);
  useEffect(() => {
    if (!actions.actionPending && !board.projectionRefreshing && focusAfterCancel.current) {
      refresh.current?.focus();
      focusAfterCancel.current = false;
    }
  }, [actions.actionPending, board.projectionRefreshing]);
  const { bids, spending, complete } = board.activeBids;
  const close = () => { if (!actions.actionPending) setOpen(false); };
  return <>
    <Button ref={trigger} shape="square" variant="outline" className="market-bids-trigger"
      aria-label={localizeCopy(`My bids, ${bids.length} active${!complete ? ", incomplete" : ""}`)}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      {localizeCopy("My bids ")}<span className="market-bids-count">{bids.length}</span>
    </Button>
    <Dialog open={open} title={localizeCopy("My bids")} layout="sheet" className="market-bids-panel"
      closeOnBackdrop={!actions.actionPending} onClose={close}
      finalFocus={() => trigger.current?.isConnected ? trigger.current : false}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen && modifyAfterClose.current) {
          const row = modifyAfterClose.current;
          modifyAfterClose.current = null;
          trigger.current?.focus();
          actions.openBid(row, "modify");
        }
      }}
      footer={<Button variant="outline" shape="square" disabled={actions.actionPending} onClick={close}>{localizeCopy("Close")}</Button>}>
      <p>{localizeCopy("Current active bids in this league. Assuming all bids succeed.")}</p>
      <p ref={total} tabIndex={-1} className="market-bids-total">{localizeCopy("Projected spending: ")}<strong>{localizeCopy(spending == null ? "Unavailable" : formatEuro(spending))}</strong></p>
      <Button ref={refresh} variant="outline" shape="square"
        disabled={actions.actionPending || board.projectionRefreshing}
        onClick={board.refreshBids}>{localizeCopy("Refresh bids")}</Button>
      {board.bidsLoading ? <p role="status">{localizeCopy("Loading bids…")}</p> : null}
      {board.projectionRefreshing && !board.bidsLoading ? <p role="status">{localizeCopy("Refreshing balance and bids…")}</p> : null}
      {board.bidsError ? <p role="alert">{localizeCopy("Bids could not be refreshed. Cached bids may be stale; retry to confirm current commitments.")}</p> : null}
      {board.projectionStale && !board.bidsError ? <p role="alert">{localizeCopy("Balance could not be refreshed. Cached projections may be stale.")}</p> : null}
      {!complete && !board.bidsLoading ? <p role="alert">{localizeCopy("Bid details are incomplete. The list, count and spending may be incomplete.")}</p> : null}
      {actions.message ? <p role="alert">{localizeCopy(actions.message)}</p> : null}
      {!board.bidsLoading && !board.bidsError && complete && bids.length === 0
        ? <p className="market-bids-empty">{localizeCopy("No active bids.")}</p> : null}
      <ul className="market-bids-list">
        {bids.map((bid) => {
          const eligible = bid.actionRow != null && bid.confirmed
            && (bid.expiresAt == null || bid.expiresAt > now);
          const modifyEligible = eligible && bid.actionRow?.marketValue != null;
          return <li key={bid.key} className="market-bid" aria-label={localizeCopy(`Bid for ${bid.name}`)}>
            <div className="market-bid-player">
              {bid.photoUrl ? <img src={bid.photoUrl} alt="" /> : null}
              <div><h3>{bid.name}</h3><p>{localizeCopy(bid.seller ?? "Seller unavailable")}</p></div>
            </div>
            <strong className="market-bid-money">{localizeCopy(bid.money == null ? "Amount unavailable" : formatEuro(bid.money))}</strong>
            <p>{localizeCopy(bid.expiresAt == null ? "Time left unavailable" : <>{localizeCopy("Time left: ")}<time
              dateTime={new Date(bid.expiresAt).toISOString()}>{localizeCopy(remainingLabel(bid.expiresAt, now))}</time></>)}</p>
            <p>{localizeCopy(bid.confirmed ? "Active" : "Awaiting server confirmation")}</p>
            {bid.issues.map((issue) => <p key={issue}>{localizeCopy(issue)}</p>)}
            {!bid.actionRow && bid.issues.length === 0 ? <p>{localizeCopy("Actions unavailable until bid details are confirmed.")}</p> : null}
            {eligible && !modifyEligible ? <p>{localizeCopy("Modify is unavailable until the market value is loaded.")}</p> : null}
            <div className="market-bid-actions">
              <Button shape="square" variant="outline" disabled={!modifyEligible || actions.actionPending}
                aria-label={localizeCopy(`Modify bid for ${bid.name}`)} onClick={() => {
                  if (!bid.actionRow) return;
                  modifyAfterClose.current = bid.actionRow;
                  setOpen(false);
                }}>{localizeCopy("Modify")}</Button>
              <Button shape="square" variant="outline" disabled={!eligible || actions.actionPending}
                aria-label={localizeCopy(`Cancel bid for ${bid.name}`)} onClick={() => {
                  if (bid.actionRow) {
                    // Cancellation can remove the focused row before the request settles.
                    focusAfterCancel.current = true;
                    total.current?.focus();
                    actions.cancelBid(bid.actionRow);
                  }
                }}>{localizeCopy("Cancel")}</Button>
            </div>
          </li>;
        })}
      </ul>
    </Dialog>
  </>;
}
