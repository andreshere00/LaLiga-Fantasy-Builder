import { Link } from "react-router-dom";

import shieldIconUrl from "../../../assets/button_shield.svg";
import { MarketActionMenu } from "../actions/MarketActionMenu";
import type { MarketActionsApi } from "../actions/useMarketActions";
import type { MarketActionContext } from "../actions/marketActions";
import { clauseUnlockTooltip } from "../marketMessages";
import { LALIGA_SELLER } from "../model/listing";
import type { MarketRow } from "../model/row";
import { clauseUnlockCountdown, remainingLabel } from "../model/valueSeries";

type SellerCellProps = {
  row: MarketRow;
  actionContext: MarketActionContext;
  actions: MarketActionsApi;
};

function SellerName({ seller, sellerTeamId }: { seller: string; sellerTeamId: string | null }) {
  if (seller === LALIGA_SELLER || !sellerTeamId) {
    return <span className="market-seller">{seller}</span>;
  }
  return (
    <Link
      className="market-seller market-seller-link"
      to={`/?team=${encodeURIComponent(sellerTeamId)}`}
    >
      {seller}
    </Link>
  );
}

function ClauseUnlockTimer({ row, now }: { row: MarketRow; now: number }) {
  if (row.sellerKind !== "opponent") return null;
  const full = clauseUnlockCountdown(row.clauseUnlockAt, now);
  if (full == null) return null;
  return (
    <span className="market-clause-timer has-hover-tooltip-panel" tabIndex={0}>
      <img className="market-clause-timer-icon" src={shieldIconUrl} alt="" aria-hidden />
      <span>{remainingLabel(row.clauseUnlockAt, now)}</span>
      <span className="hover-tooltip-panel is-align-start" role="tooltip">
        {clauseUnlockTooltip(full)}
      </span>
    </span>
  );
}

export function SellerCell({ row, actionContext, actions }: SellerCellProps) {
  return (
    <span className="market-seller-wrap">
      <MarketActionMenu row={row} context={actionContext} actions={actions} />
      <SellerName seller={row.seller} sellerTeamId={row.sellerTeamId} />
      <ClauseUnlockTimer row={row} now={actionContext.now} />
    </span>
  );
}
