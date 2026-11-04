import { t, useTranslation } from "../../../i18n";
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
  useTranslation();
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
      aria-label={t("My bids, {{0}} active{{1}}", { 0: bids.length, 1: !complete ? t(", incomplete") : "" })}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      {t("My bids ")}<span className="market-bids-count">{bids.length}</span>
    </Button>
    <Dialog open={open} title={t("My bids")} layout="sheet" className="market-bids-panel"
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
      footer={<Button variant="outline" shape="square" disabled={actions.actionPending} onClick={close}>{t("Close")}</Button>}>
      <p>{t("Current active bids in this league. Assuming all bids succeed.")}</p>
      <p ref={total} tabIndex={-1} className="market-bids-total">{t("Projected spending: ")}<strong>{spending == null ? t("Unavailable") : formatEuro(spending)}</strong></p>
      <Button ref={refresh} variant="outline" shape="square"
        disabled={actions.actionPending || board.projectionRefreshing}
        onClick={board.refreshBids}>{t("Refresh bids")}</Button>
      {board.bidsLoading ? <p role="status">{t("Loading bids…")}</p> : null}
      {board.projectionRefreshing && !board.bidsLoading ? <p role="status">{t("Refreshing balance and bids…")}</p> : null}
      {board.bidsError ? <p role="alert">{t("Bids could not be refreshed. Cached bids may be stale; retry to confirm current commitments.")}</p> : null}
      {board.projectionStale && !board.bidsError ? <p role="alert">{t("Balance could not be refreshed. Cached projections may be stale.")}</p> : null}
      {!complete && !board.bidsLoading ? <p role="alert">{t("Bid details are incomplete. The list, count and spending may be incomplete.")}</p> : null}
      {actions.message ? <p role="alert">{t(actions.message)}</p> : null}
      {!board.bidsLoading && !board.bidsError && complete && bids.length === 0
        ? <p className="market-bids-empty">{t("No active bids.")}</p> : null}
      <ul className="market-bids-list">
        {bids.map((bid) => {
          const eligible = bid.actionRow != null && bid.confirmed
            && (bid.expiresAt == null || bid.expiresAt > now);
          const modifyEligible = eligible && bid.actionRow?.marketValue != null;
          return <li key={bid.key} className="market-bid" aria-label={t("Bid for {{0}}", { 0: bid.name })}>
            <div className="market-bid-player">
              {bid.photoUrl ? <img src={bid.photoUrl} alt="" /> : null}
              <div><h3>{bid.name}</h3><p>{(bid.seller ?? t("Seller unavailable"))}</p></div>
            </div>
            <strong className="market-bid-money">{bid.money == null ? t("Amount unavailable") : formatEuro(bid.money)}</strong>
            <p>{bid.expiresAt == null ? t("Time left unavailable") : <>{t("Time left: ")}<time
              dateTime={new Date(bid.expiresAt).toISOString()}>{remainingLabel(bid.expiresAt, now)}</time></>}</p>
            <p>{bid.confirmed ? t("Active") : t("Awaiting server confirmation")}</p>
            {bid.issues.map((issue) => <p key={issue}>{t(issue)}</p>)}
            {!bid.actionRow && bid.issues.length === 0 ? <p>{t("Actions unavailable until bid details are confirmed.")}</p> : null}
            {eligible && !modifyEligible ? <p>{t("Modify is unavailable until the market value is loaded.")}</p> : null}
            <div className="market-bid-actions">
              <Button shape="square" variant="outline" disabled={!modifyEligible || actions.actionPending}
                aria-label={t("Modify bid for {{0}}", { 0: bid.name })} onClick={() => {
                  if (!bid.actionRow) return;
                  modifyAfterClose.current = bid.actionRow;
                  setOpen(false);
                }}>{t("Modify")}</Button>
              <Button shape="square" variant="outline" disabled={!eligible || actions.actionPending}
                aria-label={t("Cancel bid for {{0}}", { 0: bid.name })} onClick={() => {
                  if (bid.actionRow) {
                    // Cancellation can remove the focused row before the request settles.
                    focusAfterCancel.current = true;
                    total.current?.focus();
                    actions.cancelBid(bid.actionRow);
                  }
                }}>{t("Cancel")}</Button>
            </div>
          </li>;
        })}
      </ul>
    </Dialog>
  </>;
}
